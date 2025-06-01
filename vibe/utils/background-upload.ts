// /Users/adimov/Developer/final/vibe/utils/background-upload.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as FileSystem from "expo-file-system";
import * as TaskManager from "expo-task-manager";
import { getAuthorizationHeader } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
export const BACKGROUND_UPLOAD_TASK = "BACKGROUND_UPLOAD_TASK";
const PENDING_UPLOADS_KEY = "@background_uploads";
const ID_MAP_KEY = "@local_to_server_id_map";
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BACKGROUND_ATTEMPTS = 5; // Limit background retries per item

export interface PendingUpload {
	conversationId: string;
	localConversationId?: string;
	audioUri: string;
	audioKey: string;
	timestamp: number;
	attemptCount: number;
}

type LocalToServerIdMap = { [key: string]: string };

const getStoredIdMap = async (): Promise<LocalToServerIdMap> => {
	try {
		const mapStr = await AsyncStorage.getItem(ID_MAP_KEY);
		return mapStr ? JSON.parse(mapStr) : {};
	} catch (error) {
		console.error(
			"[BackgroundUtil:getStoredIdMap] Error getting ID map:",
			error,
		);
		return {};
	}
};

export const setStoredIdMap = async (
	idMap: LocalToServerIdMap,
): Promise<void> => {
	try {
		await AsyncStorage.setItem(ID_MAP_KEY, JSON.stringify(idMap));
	} catch (error) {
		console.error(
			"[BackgroundUtil:setStoredIdMap] Error saving ID map:",
			error,
		);
	}
};

export const getPendingUploads = async (): Promise<PendingUpload[]> => {
	// console.log(`[BackgroundUtil:getPendingUploads] Reading pending uploads from AsyncStorage key: ${PENDING_UPLOADS_KEY}`); // Verbose
	try {
		const uploadsStr = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
		const uploads = uploadsStr ? JSON.parse(uploadsStr) : [];
		// console.log(`[BackgroundUtil:getPendingUploads] Found ${uploads.length} items.`); // Verbose
		return uploads.map((u: PendingUpload) => ({
			...u,
			attemptCount: u.attemptCount ?? 0,
		}));
	} catch (error) {
		console.error(
			"[BackgroundUtil:getPendingUploads] Error getting pending uploads:",
			error,
		);
		return [];
	}
};

export const setPendingUploads = async (
	uploads: PendingUpload[],
): Promise<void> => {
	try {
		await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(uploads));
	} catch (error) {
		console.error(
			"[BackgroundUtil:setPendingUploads] Error saving uploads:",
			error,
		);
	}
};

export const saveOrUpdatePendingUpload = async (
	uploadData: Omit<PendingUpload, "timestamp" | "attemptCount"> & {
		localConversationId?: string;
	},
): Promise<void> => {
	const findLocalId =
		uploadData.localConversationId ||
		(UUID_REGEX.test(uploadData.conversationId)
			? undefined
			: uploadData.conversationId);
	// console.log(`[BackgroundUtil:saveOrUpdatePendingUpload] Saving/Updating: TargetConvID=${uploadData.conversationId}, OrigLocalID=${findLocalId || 'N/A'}, Key=${uploadData.audioKey}`); // Verbose
	try {
		const uploads = await getPendingUploads();
		const now = Date.now();

		const existingIndex = findLocalId
			? uploads.findIndex(
					(item) =>
						(item.localConversationId === findLocalId ||
							item.conversationId === findLocalId) &&
						item.audioKey === uploadData.audioKey,
				)
			: -1;

		let foundIndex = existingIndex;
		if (foundIndex === -1) {
			foundIndex = uploads.findIndex(
				(item) =>
					item.conversationId === uploadData.conversationId &&
					item.audioKey === uploadData.audioKey,
			);
		}

		if (foundIndex !== -1) {
			const existingUpload = uploads[foundIndex];
			uploads[foundIndex] = {
				...existingUpload,
				...uploadData,
				localConversationId: findLocalId || existingUpload.localConversationId,
				timestamp: now,
				// Reset attempt count if we are updating with a server ID? Or keep it? Let's keep it for now.
				attemptCount: existingUpload.attemptCount,
			};
			// console.log(`[BackgroundUtil:saveOrUpdatePendingUpload] Updated existing upload at index ${foundIndex}.`); // Verbose
		} else {
			const newUpload: PendingUpload = {
				...uploadData,
				localConversationId: findLocalId,
				timestamp: now,
				attemptCount: 0,
			};
			uploads.push(newUpload);
			// console.log(`[BackgroundUtil:saveOrUpdatePendingUpload] Added new upload.`); // Verbose
		}

		await setPendingUploads(uploads);
		// console.log(`[BackgroundUtil:saveOrUpdatePendingUpload] Save complete. Total pending: ${uploads.length}`); // Verbose
	} catch (error) {
		console.error(
			"[BackgroundUtil:saveOrUpdatePendingUpload] Error saving/updating pending upload:",
			error,
		);
	}
};

export const removePendingUpload = async (
	serverConversationId: string,
	audioKey: string,
	localToServerIds: LocalToServerIdMap,
): Promise<void> => {
	// console.log(`[BackgroundUtil:removePendingUpload] Attempting to remove: ServerConvID=${serverConversationId}, Key=${audioKey}`); // Verbose
	try {
		const uploads = await getPendingUploads();
		const initialCount = uploads.length;

		const filteredUploads = uploads.filter((upload) => {
			const isDirectMatch =
				upload.conversationId === serverConversationId &&
				upload.audioKey === audioKey;
			const isMappedMatch =
				upload.localConversationId &&
				localToServerIds[upload.localConversationId] === serverConversationId &&
				upload.audioKey === audioKey;
			const isConvIdLocalMapped =
				!UUID_REGEX.test(upload.conversationId) &&
				localToServerIds[upload.conversationId] === serverConversationId &&
				upload.audioKey === audioKey;

			return !(isDirectMatch || isMappedMatch || isConvIdLocalMapped);
		});

		if (filteredUploads.length < initialCount) {
			await setPendingUploads(filteredUploads);
			console.log(
				`[BackgroundUtil:removePendingUpload] Removed successfully. Items removed: ${initialCount - filteredUploads.length}. Total remaining: ${filteredUploads.length}`,
			);
		} else {
			// console.log(`[BackgroundUtil:removePendingUpload] Item not found for ServerConvID=${serverConversationId}, Key=${audioKey}. No changes made.`); // Verbose
		}
	} catch (error) {
		console.error(
			"[BackgroundUtil:removePendingUpload] Error removing pending upload:",
			error,
		);
	}
};

// Helper function for background uploads - expects SERVER ID
export const uploadAudioInBackground = async (
	pendingUpload: PendingUpload,
	localToServerIds: LocalToServerIdMap,
): Promise<boolean> => {
	const {
		audioUri,
		conversationId: serverConversationId,
		audioKey,
		localConversationId,
	} = pendingUpload;

	if (!UUID_REGEX.test(serverConversationId)) {
		console.error(
			`[BackgroundUtil:uploadAudioInBackground] Invalid serverConversationId format: ${serverConversationId}. Aborting background upload.`,
		);
		return false;
	}
	console.log(
		`[BackgroundUtil:uploadAudioInBackground] STARTING background upload for ServerConvID=${serverConversationId}, LocalConvID=${localConversationId || "N/A"}, Key=${audioKey}, Attempt=${pendingUpload.attemptCount + 1}`,
	);

	// --- Authentication ---
	let authHeader: string | null = null;
	try {
		authHeader = await getAuthorizationHeader();
		if (!authHeader) {
			console.error(
				"[BackgroundUtil:uploadAudioInBackground] Failed to get authorization header. Cannot proceed. Will retry later.",
			);
			// Do not remove from pending, return false to allow retry if auth becomes available
			return false;
		}
	} catch (authError) {
		console.error(
			"[BackgroundUtil:uploadAudioInBackground] Error getting authorization header:",
			authError,
		);
		return false; // Non-recoverable without auth? Or retry? Let's retry.
	}

	// --- File Check ---
	try {
		const fileInfo = await FileSystem.getInfoAsync(audioUri);
		if (!fileInfo.exists) {
			console.error(
				`[BackgroundUtil:uploadAudioInBackground] File does not exist, cannot upload: ${audioUri}. Removing from pending.`,
			);
			await removePendingUpload(
				serverConversationId,
				audioKey,
				localToServerIds,
			);
			return false; // Cannot succeed without file
		}
	} catch (infoError) {
		console.error(
			`[BackgroundUtil:uploadAudioInBackground] Error checking file existence for ${audioUri}:`,
			infoError,
		);
		return false; // Likely non-recoverable if we can't check file
	}

	// --- Upload ---
	try {
		const uploadTask = FileSystem.createUploadTask(
			`${API_URL}/audio/upload`,
			audioUri,
			{
				uploadType: FileSystem.FileSystemUploadType.MULTIPART,
				fieldName: "audio",
				parameters: { conversationId: serverConversationId, audioKey },
				headers: { Authorization: authHeader },
				mimeType: "audio/m4a",
				httpMethod: "POST",
				sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
			},
		);

		const response = await uploadTask.uploadAsync();

		// Handle 401 Unauthorized specifically
		if (response?.status === 401) {
			console.error(
				`[BackgroundUtil:uploadAudioInBackground] Received 401 Unauthorized for ${serverConversationId}_${audioKey}. Auth token likely expired. Will retry later.`,
			);
			// Do not remove from pending, return false to allow retry after user potentially re-authenticates
			return false;
		}

		if (!response || response.status < 200 || response.status >= 300) {
			// Attempt to parse JSON body for more specific errors
			let errorJson = null;
			try {
				if (response?.body) {
					errorJson = JSON.parse(response.body);
				}
			} catch (parseError) {
				// Ignore if parsing fails - means it wasn't JSON
			}

			const errorDetail =
				errorJson?.error ||
				errorJson?.message ||
				response?.body?.substring(0, 100) ||
				"No details";
			const errorMessage = `${response?.status || "Network Error"}: Background upload failed - ${errorDetail}`;

			console.error(
				`[BackgroundUtil:uploadAudioInBackground] Upload failed: ${errorMessage}`,
			);
			return false; // Indicate failure for this attempt
		}

		// --- Success ---
		console.log(
			`[BackgroundUtil:uploadAudioInBackground] Background upload SUCCESSFUL for ${serverConversationId}_${audioKey}. Status: ${response.status}.`,
		);
		await removePendingUpload(serverConversationId, audioKey, localToServerIds); // Remove from AsyncStorage

		// Delete local file on successful background upload
		try {
			await FileSystem.deleteAsync(audioUri, { idempotent: true });
			console.log(
				`[BackgroundUtil:uploadAudioInBackground] Deleted local file ${audioUri}.`,
			);
		} catch (deleteError) {
			console.error(
				`[BackgroundUtil:uploadAudioInBackground] Failed to delete local file ${audioUri} after background upload: ${deleteError}`,
			);
		}
		return true; // Indicate success
	} catch (uploadError) {
		console.error(
			`[BackgroundUtil:uploadAudioInBackground] CATCH block: Error during background upload task execution for ${serverConversationId}_${audioKey}:`,
			uploadError,
		);
		return false; // Indicate failure for this attempt
	}
};

// Define background task
TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
	const taskStartTime = Date.now();
	console.log(
		`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] TASK STARTING at ${new Date(taskStartTime).toISOString()}`,
	);
	let processedCount = 0;
	let successCount = 0;
	let failureCount = 0;
	let skippedCount = 0;
	let pendingUploads: PendingUpload[] = [];

	try {
		pendingUploads = await getPendingUploads();

		if (pendingUploads.length === 0) {
			console.log(
				`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] No pending uploads found. Exiting.`,
			);
			return BackgroundFetch.BackgroundFetchResult.NoData;
		}

		console.log(
			`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Found ${pendingUploads.length} pending uploads. Processing...`,
		);
		let localToServerIds: LocalToServerIdMap = {};
		try {
			localToServerIds = await getStoredIdMap();
			// console.log(`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Loaded ID map. Found ${Object.keys(localToServerIds).length} mappings.`); // Verbose
		} catch (storeError) {
			console.warn(
				`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Could not access stored ID map. Map may be empty.`,
			);
		}

		const uploadsToProcess = [...pendingUploads];

		for (const upload of uploadsToProcess) {
			processedCount++;

			// Check attempt count
			if (upload.attemptCount >= MAX_BACKGROUND_ATTEMPTS) {
				console.warn(
					`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Skipping upload ${upload.audioKey} for ${upload.conversationId} - Max attempts (${MAX_BACKGROUND_ATTEMPTS}) reached.`,
				);
				skippedCount++;
				continue;
			}

			let serverIdToUse: string | undefined = undefined;
			const originalLocalId =
				upload.localConversationId ||
				(UUID_REGEX.test(upload.conversationId) ? null : upload.conversationId);

			if (UUID_REGEX.test(upload.conversationId)) {
				serverIdToUse = upload.conversationId;
			} else {
				const mappedServerId = localToServerIds[upload.conversationId];
				if (mappedServerId) {
					serverIdToUse = mappedServerId;
					// Update the record in AsyncStorage for future runs
					await saveOrUpdatePendingUpload({
						...upload,
						conversationId: serverIdToUse,
						localConversationId: upload.conversationId,
					});
				} else {
					console.warn(
						`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Server ID for Local ID ${upload.conversationId} not found in map. Skipping background upload attempt.`,
					);
					skippedCount++;
					continue;
				}
			}

			if (serverIdToUse) {
				const uploadObjectWithServerId: PendingUpload = {
					...upload,
					conversationId: serverIdToUse,
					localConversationId: originalLocalId || undefined,
				};

				const success = await uploadAudioInBackground(
					uploadObjectWithServerId,
					localToServerIds,
				);

				if (success) {
					successCount++;
				} else {
					failureCount++;
					// Increment attempt count in AsyncStorage for the *original* item found
					try {
						const currentUploads = await getPendingUploads();
						// Find by URI as it should be unique for the pending item
						const indexToUpdate = currentUploads.findIndex(
							(u) => u.audioUri === upload.audioUri,
						);
						if (indexToUpdate !== -1) {
							const currentAttemptCount =
								currentUploads[indexToUpdate].attemptCount || 0;
							currentUploads[indexToUpdate].attemptCount =
								currentAttemptCount + 1;
							await setPendingUploads(currentUploads);
							console.log(
								`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Incremented attempt count to ${currentAttemptCount + 1} for failed upload: ${upload.audioKey}`,
							);
						}
					} catch (e) {
						console.error("Failed to update attempt count", e);
					}
				}
			} else {
				console.error(
					`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] Logic error: Reached upload step without a Server ID for ${upload.audioKey}`,
				);
				skippedCount++;
			}
		}

		const taskEndTime = Date.now();
		const finalPending = await getPendingUploads(); // Check remaining count
		console.log(
			`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] TASK FINISHED in ${taskEndTime - taskStartTime}ms. Processed: ${processedCount}, Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skippedCount}. Remaining Pending: ${finalPending.length}`,
		);

		// Determine result based on whether *new* data was processed successfully
		// or if failures occurred that might warrant a retry sooner.
		if (successCount > 0) return BackgroundFetch.BackgroundFetchResult.NewData;
		if (failureCount > 0) return BackgroundFetch.BackgroundFetchResult.Failed; // Signal failure if uploads failed
		return BackgroundFetch.BackgroundFetchResult.NoData; // No new data processed successfully
	} catch (error) {
		const taskEndTime = Date.now();
		console.error(
			`[BackgroundTask:${BACKGROUND_UPLOAD_TASK}] CRITICAL TASK ERROR after ${taskEndTime - taskStartTime}ms:`,
			error,
		);
		return BackgroundFetch.BackgroundFetchResult.Failed;
	}
});

/**
 * Registers the background fetch task if not already registered.
 */
export const registerBackgroundUploadTask = async (): Promise<void> => {
	try {
		const isRegistered = await TaskManager.isTaskRegisteredAsync(
			BACKGROUND_UPLOAD_TASK,
		);
		if (!isRegistered) {
			const intervalMinutes = 5; // Check every 5 minutes
			await BackgroundFetch.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
				minimumInterval: 60 * intervalMinutes, // Interval in seconds
				stopOnTerminate: false, // Keep running task even if app is terminated
				startOnBoot: true, // Restart task on device boot (Android only)
			});
			console.log(
				`[BackgroundUtil:registerBackgroundUploadTask] Background task '${BACKGROUND_UPLOAD_TASK}' registered with interval ~${intervalMinutes} minutes.`,
			);
		} else {
			// console.log(`[BackgroundUtil:registerBackgroundUploadTask] Background task '${BACKGROUND_UPLOAD_TASK}' already registered.`); // Verbose
		}
		// Log current status for debugging
		// const status = await BackgroundFetch.getStatusAsync();
		// const permissions = await BackgroundFetch.getPermissionsAsync();
		// const statusString = status !== null ? BackgroundFetch.BackgroundFetchStatus[status] : 'Unknown (null)';
		// console.log(`[BackgroundUtil:registerBackgroundUploadTask] Current BackgroundFetch status: ${statusString}, Permissions: ${JSON.stringify(permissions)}`);
	} catch (e) {
		console.error(
			"[BackgroundUtil:registerBackgroundUploadTask] Failed to register background upload task:",
			e,
		);
	}
};
