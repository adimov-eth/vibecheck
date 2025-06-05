// src/api/index.ts
import { requireAuth } from "@/middleware/auth"; // Keep the import if other routes use it globally
import { handleError } from "@/middleware/error";
import { apiRateLimiter } from "@/middleware/rate-limit";
import { log } from "@/utils/logger";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import multer from "multer";
import audioRoutes from "./routes/audio";
import authRoutes from "./routes/auth";
import conversationRoutes from "./routes/conversation";
import debugRoutes from "./routes/debug";
import subscriptionRoutes from "./routes/subscription";
import userRoutes from "./routes/user"; // Import user routes
import * as adminJwtRoutes from "./routes/admin-jwt-routes";

// Create Express app
export const app = express();

// Apply middleware
app.use(helmet());
app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
		allowedHeaders: ["Content-Type", "Authorization"],
	}),
);

// Request logger
app.use((req, res, next) => {
	log.debug("Request received", { method: req.method, path: req.path });
	const start = Date.now();

	res.on("finish", () => {
		const duration = Date.now() - start;
		log.debug("Request finished", {
			method: req.method,
			path: req.path,
			status: res.statusCode,
			durationMs: duration,
		});
	});

	next();
});

// Parse JSON requests globally for all routes that might need it.
app.use(express.json());

// Apply requireAuth specifically to other top-level routes if needed
app.use("/audio", requireAuth);
app.use("/conversations", requireAuth);
app.use("/subscriptions", requireAuth);
// Note: /users routes will apply requireAuth internally where needed

// Default rate limiter
app.use(apiRateLimiter);

// Health check endpoint
app.get("/health", (_, res) => {
	res.status(200).json({ status: "ok" });
});

// Routes
app.use("/users", userRoutes); // Mount the user router - NO global requireAuth here
app.use("/auth", authRoutes); // Auth routes (CAPTCHA, unlock, etc.)
app.use("/audio", audioRoutes);
app.use("/conversations", conversationRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/debug", debugRoutes); // Debug endpoints (development only)

// Admin routes
app.get("/admin/jwt/keys", adminJwtRoutes.listKeys);
app.post("/admin/jwt/keys/revoke", adminJwtRoutes.revokeKey);
app.post("/admin/jwt/keys/rotate", adminJwtRoutes.rotateKeys);

// 404 handler
app.use((_, res) => {
	res.status(404).json({ error: "Not Found" });
});

// Multer error handler (must come before your main error handler)
function isMulterError(err: unknown): err is multer.MulterError {
	return (
		err !== null &&
		typeof err === "object" &&
		"name" in err &&
		(err as { name: string }).name === "MulterError"
	);
}

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
	if (err instanceof multer.MulterError || isMulterError(err)) {
		return res.status(400).json({
			success: false,
			error: "UPLOAD_ERROR",
			message: (err as Error).message,
		});
	}
	next(err);
});

// Error handler
app.use(handleError);
