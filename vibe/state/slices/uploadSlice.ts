import {
	getPendingUploads,
	removePendingUpload,
	saveOrUpdatePendingUpload,
	setStoredIdMap,
} from "@/utils/background-upload";
import { uploadFile } from "@/utils/upload-helpers";
import * as FileSystem from "expo-file-system";
import type { StateCreator } from "zustand";
import type { StoreState, UploadSlice } from "../types";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createUploadSlice: StateCreator<
	StoreState,
	[],
	[],
	UploadSlice
> = (set, get) => ({
	uploadProgress: {},
	uploadResults: {},
	localToServerIds: {},

	initializeUploads: async () => {
		console.log(
			"[UploadSlice:initializeUploads] Initializing uploads from persisted state...",
		);
		try {
			const persistedPendingUploads = await getPendingUploads();
			console.log(
				`[UploadSlice:initializeUploads] Found ${persistedPendingUploads.length} persisted uploads from AsyncStorage.`,
			);
			const currentLocalToServerIds = get().localToServerIds;

			if (persistedPendingUploads.length > 0) {
				console.log(
					"[UploadSlice:initializeUploads] Attempting to process persisted uploads...",
				);
				for (const upload of persistedPendingUploads) {
					let serverIdToUse: string | undefined = undefined;
					// Determine the original local ID (might be in conversationId or localConversationId)
					// Ensure localId is string | undefined, not null
					const localId: string | undefined =
						upload.localConversationId ||
						(UUID_REGEX.test(upload.conversationId)
							? undefined
							: upload.conversationId);

					// Check if conversationId IS the server ID
					if (UUID_REGEX.test(upload.conversationId)) {
						serverIdToUse = upload.conversationId;
					} else if (localId) {
						// Check map using the original local ID
						serverIdToUse = currentLocalToServerIds[localId];
					}

					const uploadId = `${serverIdToUse || localId || "unknown"}_${upload.audioKey}`; // Use serverId if known for unique ID
					const existingResult = get().uploadResults[uploadId];

					// console.log(`[UploadSlice:initializeUploads] Processing persisted: UploadID=${uploadId}, StoredConvID=${upload.conversationId}, OriginalLocalID=${localId || 'N/A'}, Key=${upload.audioKey}`); // Verbose

					if (!serverIdToUse) {
						// console.log(`[UploadSlice:initializeUploads] Server ID for ${localId || upload.conversationId} not yet known. Skipping immediate retry.`); // Verbose
						continue; // Skip if server ID isn't available yet
					}

					// If already succeeded or currently in progress (progress >= 0), skip retry
					const currentProgress = get().uploadProgress[uploadId];
					if (
						existingResult?.success ||
						(currentProgress !== undefined && currentProgress >= 0)
					) {
						// console.log(`[UploadSlice:initializeUploads] Skipping retry for already successful/in-progress persisted upload: ${uploadId}`); // Verbose
						// Attempt removal again in case it failed before
						if (existingResult?.success) {
							await removePendingUpload(
								serverIdToUse,
								upload.audioKey,
								currentLocalToServerIds,
							);
						}
						continue;
					}

					// If we have a server ID and it hasn't succeeded/isn't in progress, attempt upload
					console.log(
						`[UploadSlice:initializeUploads] Retrying persisted upload via foreground: ${uploadId}`,
					);
					await get().uploadAudio(
						upload.audioUri,
						serverIdToUse, // Pass SERVER ID
						upload.audioKey,
						localId, // Pass original local ID (can be undefined)
						true, // Indicate this is a retry from persisted state
					);
				}
			}
		} catch (error) {
			console.error(
				"[UploadSlice:initializeUploads] Failed to initialize/process persisted uploads:",
				error,
			);
		}
	},

	setLocalToServerId: async (localId: string, serverId: string) => {
		console.log(
			`[UploadSlice:setLocalToServerId] Mapping localId ${localId} to serverId ${serverId}`,
		);
		const currentMap = get().localToServerIds;
		const previouslyUnmapped = !currentMap[localId];
		const updatedMap = { ...currentMap, [localId]: serverId };

		// Update Zustand state
		set({ localToServerIds: updatedMap });

		// --- Sync with AsyncStorage for background task ---
		try {
			await setStoredIdMap(updatedMap); // Use the new helper
			console.log(
				"[UploadSlice:setLocalToServerId] Synced updated ID map to AsyncStorage.",
			);
		} catch (e) {
			console.error(
				"[UploadSlice:setLocalToServerId] Failed to sync ID map to AsyncStorage:",
				e,
			);
		}
		// --- End Sync ---

		if (previouslyUnmapped) {
			console.log(
				`[UploadSlice:setLocalToServerId] First time serverId received for ${localId}. Processing associated persisted uploads.`,
			);
			try {
				const persistedUploads = await getPendingUploads();
				const uploadsForLocalId = persistedUploads.filter(
					// Find uploads where conversationId is the localId (meaning serverId was unknown)
					(upload) => upload.conversationId === localId,
				);

				console.log(
					`[UploadSlice:setLocalToServerId] Found ${uploadsForLocalId.length} persisted uploads originally saved with localId ${localId}.`,
				);

				for (const upload of uploadsForLocalId) {
					// Update the record in AsyncStorage with the server ID
					await saveOrUpdatePendingUpload({
						// Pass existing data, but update conversationId and ensure localConversationId is set
						...upload,
						conversationId: serverId, // Update to server ID
						localConversationId: localId, // Store the original local ID
					});
					console.log(
						`[UploadSlice:setLocalToServerId] Updated AsyncStorage record for key ${upload.audioKey} with serverId ${serverId}.`,
					);

					// Check if already successful/in progress before triggering foreground upload
					const uploadId = `${serverId}_${upload.audioKey}`;
					const existingResult = get().uploadResults[uploadId];
					const currentProgress = get().uploadProgress[uploadId];
					if (
						existingResult?.success ||
						(currentProgress !== undefined && currentProgress >= 0)
					) {
						console.log(
							`[UploadSlice:setLocalToServerId] Skipping foreground trigger for already successful/in-progress upload: ${uploadId}`,
						);
						if (existingResult?.success) {
							// Pass map to removePendingUpload
							await removePendingUpload(serverId, upload.audioKey, updatedMap);
						}
						continue;
					}

					// Trigger foreground upload attempt now
					console.log(
						`[UploadSlice:setLocalToServerId] Triggering foreground upload for ${uploadId}`,
					);
					await get().uploadAudio(
						upload.audioUri,
						serverId,
						upload.audioKey,
						localId, // Pass original local ID
						true, // Mark as persisted retry
					);
				}
			} catch (error) {
				console.error(
					`[UploadSlice:setLocalToServerId] Error processing persisted uploads for ${localId}:`,
					error,
				);
			}
		} else {
			console.log(
				`[UploadSlice:setLocalToServerId] ServerId for ${localId} was already known. No immediate action needed.`,
			);
		}
	},

	// Renamed from addPendingUpload
	saveUploadIntent: async (
		localConversationId: string,
		audioUri: string,
		audioKey: string,
	) => {
		console.log(
			`[UploadSlice:saveUploadIntent] Called for localId: ${localConversationId}, key: ${audioKey}`,
		);

		const currentLocalToServerIds = get().localToServerIds; // Get map from state
		const serverId = currentLocalToServerIds[localConversationId];

		// Always save/update AsyncStorage first
		await saveOrUpdatePendingUpload({
			conversationId: serverId || localConversationId, // Use serverId if known, else localId
			localConversationId: localConversationId, // Always pass the original local ID for finding/updating
			audioUri,
			audioKey,
		});
		console.log(
			`[UploadSlice:saveUploadIntent] Saved/Updated intent in AsyncStorage. Target ConvID: ${serverId || localConversationId}, Key: ${audioKey}`,
		);

		// If server ID is known, attempt immediate foreground upload
		if (serverId) {
			console.log(
				`[UploadSlice:saveUploadIntent] ServerId ${serverId} known. Attempting immediate foreground upload.`,
			);
			const uploadId = `${serverId}_${audioKey}`;
			const existingResult = get().uploadResults[uploadId];
			const currentProgress = get().uploadProgress[uploadId];

			if (
				existingResult?.success ||
				(currentProgress !== undefined && currentProgress >= 0)
			) {
				console.log(
					`[UploadSlice:saveUploadIntent] Skipping foreground upload for already successful/in-progress item: ${uploadId}`,
				);
				if (existingResult?.success) {
					// Pass map to removePendingUpload
					await removePendingUpload(
						serverId,
						audioKey,
						currentLocalToServerIds,
					);
				}
			} else {
				// Start foreground upload
				await get().uploadAudio(
					audioUri,
					serverId,
					audioKey,
					localConversationId,
				);
			}
		} else {
			console.log(
				`[UploadSlice:saveUploadIntent] ServerId not yet known for ${localConversationId}. Intent saved. Background task or setLocalToServerId will handle upload.`,
			);
		}
	},

	uploadAudio: async (
		audioUri: string,
		conversationId: string, // MUST be SERVER ID here
		audioKey: string,
		localConversationId?: string, // Original local ID (can be undefined)
		isPersistedRetry = false,
	) => {
		// Validate Server ID format
		if (!UUID_REGEX.test(conversationId)) {
			console.error(
				`[UploadSlice:uploadAudio] Attempted to upload with an invalid server Conversation ID: ${conversationId}. Aborting.`,
			);
			const tempUploadId = `${localConversationId || conversationId}_${audioKey}`;
			set((state) => ({
				uploadResults: {
					...state.uploadResults,
					[tempUploadId]: {
						success: false,
						error: "Internal Error: Invalid Server ID for upload",
						audioUri,
						conversationId,
						audioKey,
						localConversationId,
					},
				},
				uploadProgress: { ...state.uploadProgress, [tempUploadId]: -1 },
			}));
			return;
		}

		const uploadId = `${conversationId}_${audioKey}`; // Unique ID based on SERVER ID
		const currentLocalToServerIds = get().localToServerIds; // Get map from state
		console.log(
			`[UploadSlice:uploadAudio] STARTING UploadId=${uploadId}, ServerConvId=${conversationId}, LocalConvId=${localConversationId || "N/A"}, Key=${audioKey}, IsPersistedRetry=${isPersistedRetry}, URI=${audioUri}`,
		);

		// --- File Check ---
		try {
			const fileInfo = await FileSystem.getInfoAsync(audioUri);
			if (!fileInfo.exists) {
				console.error(
					`[UploadSlice:uploadAudio] File does not exist: ${audioUri}`,
				);
				set((state) => ({
					uploadResults: {
						...state.uploadResults,
						[uploadId]: {
							success: false,
							error: "Local file missing",
							audioUri,
							conversationId,
							audioKey,
							localConversationId,
						},
					},
					uploadProgress: { ...state.uploadProgress, [uploadId]: -1 },
				}));
				// Pass map to removePendingUpload
				await removePendingUpload(
					conversationId,
					audioKey,
					currentLocalToServerIds,
				);
				return;
			}
		} catch (infoError) {
			// Check if infoError is an Error instance
			const errorMessage =
				infoError instanceof Error ? infoError.message : String(infoError);
			console.error(
				`[UploadSlice:uploadAudio] Error checking file existence for ${audioUri}:`,
				errorMessage,
			);
			set((state) => ({
				uploadResults: {
					...state.uploadResults,
					[uploadId]: {
						success: false,
						error: `File check error: ${errorMessage}`,
						audioUri,
						conversationId,
						audioKey,
						localConversationId,
					},
				},
				uploadProgress: { ...state.uploadProgress, [uploadId]: -1 },
			}));
			// Don't remove from AsyncStorage here, could be temporary issue
			return;
		}

		// --- Perform Upload ---
		try {
			set((state) => ({
				uploadProgress: { ...state.uploadProgress, [uploadId]: 0 },
				uploadResults: {
					...state.uploadResults,
					[uploadId]: {
						success: false,
						error: undefined,
						audioUri,
						conversationId,
						audioKey,
						localConversationId,
					},
				},
			}));

			// console.log(`[UploadSlice:uploadAudio] Calling uploadFile helper for ${uploadId}`); // Verbose
			const result = await uploadFile({
				audioUri,
				conversationId, // Pass SERVER ID
				audioKey,
				onProgress: (progress) => {
					set((state) => ({
						uploadProgress: { ...state.uploadProgress, [uploadId]: progress },
					}));
				},
			});

			// console.log(`[UploadSlice:uploadAudio] UploadFile helper finished for ${uploadId}. Success: ${result.success}, Status Code: ${result.statusCode}, Error: ${result.error}`); // Verbose

			set((state) => ({
				uploadResults: {
					...state.uploadResults,
					[uploadId]: {
						...result,
						audioUri,
						conversationId,
						audioKey,
						localConversationId,
					},
				},
				uploadProgress: {
					...state.uploadProgress,
					[uploadId]: result.success ? 100 : -1,
				},
			}));

			if (result.success) {
				console.log(
					`[UploadSlice:uploadAudio] Foreground upload SUCCESSFUL for ${uploadId}.`,
				);
				// Pass map to removePendingUpload
				await removePendingUpload(
					conversationId,
					audioKey,
					currentLocalToServerIds,
				);

				// --- Delete local file after successful upload ---
				try {
					console.log(
						`[UploadSlice:uploadAudio] Deleting local file ${audioUri} after successful foreground upload.`,
					);
					await FileSystem.deleteAsync(audioUri, { idempotent: true });
					console.log(
						`[UploadSlice:uploadAudio] Deleted local file ${audioUri}.`,
					);
				} catch (deleteError) {
					console.error(
						`[UploadSlice:uploadAudio] Failed to delete local file ${audioUri} after foreground upload: ${deleteError}`,
					);
					// Do not fail the overall upload state for cleanup failure, just log it.
				}
				// --- End file deletion ---
			} else {
				console.error(
					`[UploadSlice:uploadAudio] Foreground upload FAILED for ${uploadId}: ${result.error}`,
				);

				// --- FIX: Check for non-retryable errors ---
				const isNonRetryableError =
					result.statusCode === 400 &&
					result.error &&
					(result.error.includes("Maximum number of audios") ||
						result.error.includes("already exists"));

				if (isNonRetryableError) {
					console.warn(
						`[UploadSlice:uploadAudio] Upload failed for ${uploadId} due to non-retryable server error (${result.statusCode}). Removing from pending uploads.`,
					);
					await removePendingUpload(
						conversationId,
						audioKey,
						currentLocalToServerIds,
					);
					// Optionally, delete the local file as well since it won't be uploaded
					try {
						console.log(
							`[UploadSlice:uploadAudio] Deleting local file ${audioUri} after non-retryable upload failure.`,
						);
						await FileSystem.deleteAsync(audioUri, { idempotent: true });
					} catch (deleteError) {
						console.error(
							`[UploadSlice:uploadAudio] Failed to delete local file ${audioUri} after non-retryable failure: ${deleteError}`,
						);
					}
				} else {
					// Original behavior for potentially transient errors
					console.warn(
						`[UploadSlice:uploadAudio] Upload failed for ${uploadId} (Status: ${result.statusCode}). Pending record should exist in AsyncStorage for background task.`,
					);
				}
				// --- End Fix ---
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`[UploadSlice:uploadAudio] UNCAUGHT error during foreground upload for ${uploadId}:`,
				errorMessage,
			);
			set((state) => ({
				uploadResults: {
					...state.uploadResults,
					[uploadId]: {
						success: false,
						error: `Uncaught: ${errorMessage}`,
						audioUri,
						conversationId,
						audioKey,
						localConversationId,
					},
				},
				uploadProgress: { ...state.uploadProgress, [uploadId]: -1 },
			}));
			console.warn(
				`[UploadSlice:uploadAudio] Upload failed (uncaught) for ${uploadId}. Pending record should exist in AsyncStorage for background task.`,
			);
		}
	},

	clearUploadState: (conversationId: string) => {
		// Clears UI state (progress, results) but leaves AsyncStorage.
		// conversationId can be local or server ID.
		console.log(
			`[UploadSlice:clearUploadState] Clearing UI state for ID: ${conversationId}`,
		);
		set((state) => {
			const serverId = state.localToServerIds[conversationId] || conversationId;
			const newProgress = { ...state.uploadProgress };
			const newResults = { ...state.uploadResults };

			// Find keys related to this serverId OR original localId
			const uploadIdsToClear = Object.keys(newResults).filter(
				(id) =>
					id.startsWith(`${serverId}_`) ||
					state.uploadResults[id]?.localConversationId === conversationId,
			);
			const progressIdsToClear = Object.keys(newProgress).filter((id) =>
				id.startsWith(`${serverId}_`),
			);

			if (uploadIdsToClear.length > 0) {
				// console.log(`[UploadSlice:clearUploadState] Clearing results state for ${uploadIdsToClear.length} uploads related to ID ${conversationId} (Server ID: ${serverId})`); // Verbose
				for (const id of uploadIdsToClear) {
					delete newResults[id];
				}
			}
			if (progressIdsToClear.length > 0) {
				// console.log(`[UploadSlice:clearUploadState] Clearing progress state for ${progressIdsToClear.length} uploads related to ID ${conversationId} (Server ID: ${serverId})`); // Verbose
				for (const id of progressIdsToClear) {
					delete newProgress[id];
				}
			}

			// Does NOT clear localToServerIds mapping or AsyncStorage.
			return { uploadProgress: newProgress, uploadResults: newResults };
		});
	},

	retryUpload: async (uploadId: string) => {
		// uploadId is `${serverId}_${audioKey}`
		console.log(
			`[UploadSlice:retryUpload] Manual retry requested for: ${uploadId}`,
		);
		const state = get();
		const failedUploadResult = state.uploadResults[uploadId];

		if (!failedUploadResult) {
			console.warn(
				`[UploadSlice:retryUpload] Cannot retry upload ${uploadId}: Result data not found.`,
			);
			return;
		}
		// Extract necessary info from the result
		const {
			audioUri,
			conversationId: serverId,
			audioKey,
			localConversationId: localId,
		} = failedUploadResult;

		if (!audioUri || !serverId || !audioKey) {
			console.warn(
				`[UploadSlice:retryUpload] Cannot retry upload ${uploadId}: Missing required data in stored result.`,
				failedUploadResult,
			);
			return;
		}
		// Validate Server ID format just in case
		if (!UUID_REGEX.test(serverId)) {
			console.error(
				`[UploadSlice:retryUpload] Invalid Server ID found in result for ${uploadId}: ${serverId}. Cannot retry.`,
			);
			return;
		}

		console.log(
			`[UploadSlice:retryUpload] Retrying upload ${uploadId} via foreground. ServerID=${serverId}, LocalID=${localId || "N/A"}, Key=${audioKey}`,
		);

		// Ensure the item exists in AsyncStorage with the correct Server ID before retrying.
		// This handles cases where the initial save might have used local ID or failed.
		// Check if localId exists and is a string before calling saveOrUpdatePendingUpload
		if (typeof localId === "string") {
			await saveOrUpdatePendingUpload({
				conversationId: serverId,
				localConversationId: localId, // Pass original localId
				audioUri,
				audioKey,
			});
			console.log(
				`[UploadSlice:retryUpload] Ensured pending record exists in AsyncStorage for ${uploadId}.`,
			);
		} else {
			// If localId is missing, we might not be able to reliably update/find the AsyncStorage record
			// based on localId. However, the background task *should* have already updated it
			// when the serverId became known. Proceed with the upload attempt, but log a warning.
			console.warn(
				`[UploadSlice:retryUpload] Original localConversationId is missing for ${uploadId}. Cannot guarantee AsyncStorage record consistency, but attempting foreground upload anyway.`,
			);
			// Optionally, try saving just with serverId, though this might create duplicates if the background task didn't run/update yet
			await saveOrUpdatePendingUpload({
				conversationId: serverId,
				// localConversationId: undefined, // Explicitly undefined
				audioUri,
				audioKey,
			});
		}

		// Call uploadAudio with isPersistedRetry = true
		await state.uploadAudio(
			audioUri,
			serverId,
			audioKey,
			localId,
			true, // Mark as retry
		);
	},
});
