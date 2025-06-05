// src/api/routes/audio.ts
import { requireAuth, requireResourceOwnership } from "@/middleware/auth";
import {
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "@/middleware/error";
import { audioRateLimiter } from "@/middleware/rate-limit";
import { audioQueue } from "@/queues";
import {
	checkAudioUploadConstraints,
	createAudioRecord,
	getAudioById,
	getConversationAudios,
	updateAudioStatus,
} from "@/services/audio-service";
import { getConversationById } from "@/services/conversation-service";
import type { Audio } from "@/types";
import type { AuthenticatedRequest } from "@/types/common";
import { asyncHandler } from "@/utils/async-handler";
import { formatError } from "@/utils/error-formatter";
import { saveFile } from "@/utils/file";
import { log } from "@/utils/logger";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

const router = Router();

// Configure multer for audio uploads
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
	fileFilter: (_req, file, cb) => {
		const allowedMimeTypes = [
			"audio/webm",
			"audio/wav",
			"audio/m4a",
			"audio/mp4",
			"audio/x-m4a",
		];

		if (allowedMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			// Use ValidationError for consistency
			cb(
				new ValidationError(
					`Unsupported audio format. Allowed formats: webm, wav, m4a. Received: ${file.mimetype}`,
				),
			);
		}
	},
});

// Validation schemas
const uploadAudioSchema = z.object({
	conversationId: z.string().min(1, "Conversation ID is required"),
	audioKey: z.string().min(1, "Audio key is required"), // Added audioKey validation
});

const updateStatusSchema = z.object({
	status: z.enum(["uploaded", "processing", "transcribed", "failed"]),
});

// --- Apply Middleware Selectively ---

// Upload new audio file
router.post(
	"/upload",
	requireAuth, // 1. Authenticate first
	audioRateLimiter, // 2. Apply rate limiting
	async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const uploadSingle = upload.single("audio");
		uploadSingle(req, res, async (err: unknown) => {
			if (err) return next(err); // Pass Multer errors to error middleware

			const userId = (req as AuthenticatedRequest).userId;

			// Validate request body
			log.debug("Upload request body:", req.body);
			const validationResult = uploadAudioSchema.safeParse(req.body);
			if (!validationResult.success) {
				log.debug("Validation failed:", validationResult.error);
				return next(
					new ValidationError(
						`Invalid request: ${validationResult.error.errors.map((e) => e.message).join(", ")}`,
					),
				);
			}

			const { conversationId, audioKey } = validationResult.data;

			// Check if conversation exists
			const conversation = await getConversationById(conversationId);
			if (!conversation) {
				return next(
					new NotFoundError(`Conversation not found: ${conversationId}`),
				);
			}
			if (conversation.userId !== userId) {
				return next(
					new AuthorizationError(
						`User does not own conversation ${conversationId}`,
					),
				);
			}

			// Validate file upload
			if (!req.file) {
				return next(new ValidationError("No audio file provided"));
			}

			// Add constraint check BEFORE saving
			try {
				await checkAudioUploadConstraints({ conversationId, userId, audioKey });
			} catch (error) {
				return next(error);
			}

			// Save file and create record
			const fileExtension =
				req.file.originalname.split(".").pop() ||
				req.file.mimetype.split("/")[1] ||
				"m4a";
			const fileName = `conv_${conversationId}_key_${audioKey}_${Date.now()}.${fileExtension}`;
			const filePath = await saveFile(req.file.buffer, fileName);

			let audio: Audio;
			try {
				audio = await createAudioRecord({
					conversationId,
					userId,
					audioFile: filePath,
					audioKey: audioKey,
				});
			} catch (error) {
				log.error("Error creating audio record", {
					conversationId,
					audioKey,
					error: formatError(error),
				});
				return next(error);
			}

			await audioQueue.add(
				"process-audio",
				{
					audioId: audio.id,
					conversationId,
					audioPath: filePath,
					userId,
					audioKey: audioKey,
				},
				{
					attempts: 3,
					backoff: { type: "exponential", delay: 5000 },
				},
			);

			log.debug("Created audio record and queued for processing", {
				audioId: audio.id,
				conversationId,
				audioKey,
			});
			res.status(201).json({
				success: true,
				message: "Audio uploaded and queued for processing.",
				audioId: audio.id,
				url: filePath,
			});
		});
	},
);

// Get audio by ID
router.get(
	"/:id",
	requireAuth, // Apply auth
	requireResourceOwnership({
		getResourceById: getAudioById,
		resourceName: "Audio",
	}),
	asyncHandler(async (req: Request, res: Response): Promise<void> => {
		const { resource, userId } = req as AuthenticatedRequest;
		const audio = resource as Audio;

		log.debug("Retrieved audio", { audioId: audio.id, userId });
		res.json({ audio }); // Return the full audio object
	}),
);

// Get all audios for a conversation
router.get(
	"/conversation/:conversationId",
	requireAuth, // Apply auth
	requireResourceOwnership({
		getResourceById: getConversationById,
		resourceName: "Conversation",
		idParamName: "conversationId",
	}),
	asyncHandler(async (req: Request, res: Response): Promise<void> => {
		const userId = (req as AuthenticatedRequest).userId;
		const { conversationId } = req.params;

		const audios = await getConversationAudios(conversationId);
		log.debug("Retrieved audios for conversation", {
			count: audios.length,
			conversationId,
			userId,
		});
		res.json({ audios }); // Return the list of audio objects
	}),
);

// Update audio status (Potentially for internal use or admin?)
router.patch(
	"/:id/status",
	requireAuth, // Apply auth
	requireResourceOwnership({
		getResourceById: getAudioById,
		resourceName: "Audio",
	}),
	asyncHandler(async (req: Request, res: Response): Promise<void> => {
		const { resource, userId } = req as AuthenticatedRequest;
		const audio = resource as Audio;

		// Validate request body
		const validationResult = updateStatusSchema.safeParse(req.body);
		if (!validationResult.success) {
			throw new ValidationError(
				`Invalid status: ${validationResult.error.errors.map((e) => e.message).join(", ")}`,
			);
		}

		const { status } = validationResult.data;

		await updateAudioStatus(audio.id as number, status);
		log.debug("Updated audio status", { audioId: audio.id, status, userId });
		res.json({ success: true });
	}),
);

export default router;
