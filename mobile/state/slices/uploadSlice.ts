import { getClerkInstance } from "@clerk/clerk-expo";
import * as BackgroundFetch from "expo-background-fetch";
import * as FileSystem from "expo-file-system";
import * as TaskManager from "expo-task-manager";
import { StateCreator } from "zustand";
import { API_BASE_URL, PendingUpload, StoreState, UploadResult } from "../types";
const BACKGROUND_UPLOAD_TASK = "BACKGROUND_UPLOAD_TASK";

// Define background task
TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background task error:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }

  const { audioUri, conversationId, audioKey } = data as PendingUpload;
  try {
    // Attempt to upload in background
    await uploadAudioInBackground(audioUri, conversationId, audioKey);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error("Background upload failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Helper function for background uploads
const uploadAudioInBackground = async (
  audioUri: string,
  conversationId: string,
  audioKey: string
): Promise<void> => {
  const uploadTask = FileSystem.createUploadTask(
    `${API_BASE_URL}/audio/upload`,
    audioUri,
    {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "audio",
      parameters: { conversationId, audioKey },
      headers: {
        // Note: Token handling in background tasks needs to be handled carefully
        // You might need to store the token securely and retrieve it here
        Authorization: `Bearer ${await getStoredToken()}`,
      },
      mimeType: "audio/m4a",
    }
  );

  const response = await uploadTask.uploadAsync();
  if (!response || (response.status !== 200 && response.status !== 201)) {
    throw new Error(`Upload failed with status ${response?.status || 'unknown'}`);
  }
};

// Helper to get stored token (implement secure storage as needed)
const getStoredToken = async (): Promise<string> => {
  // Implement secure token retrieval
  // This is a placeholder - you should implement secure token storage
  return ""; // TODO: Implement secure token storage
};

interface UploadSlice {
  uploadProgress: { [uploadId: string]: number };
  uploadResults: { [uploadId: string]: UploadResult };
  pendingUploads: PendingUpload[];
  localToServerIds: { [localConversationId: string]: string };
  uploadAudio: (audioUri: string, conversationId: string, audioKey: string) => Promise<void>;
  addPendingUpload: (localConversationId: string, audioUri: string, audioKey: string) => void;
  processPendingUploads: (localConversationId: string) => void;
  setLocalToServerId: (localId: string, serverId: string) => void;
  clearUploadState: (conversationId: string) => void;
  retryUpload: (uploadId: string) => void;
}

export const createUploadSlice: StateCreator<StoreState, [], [], UploadSlice> = (
  set,
  get
) => ({
  uploadProgress: {},
  uploadResults: {},
  pendingUploads: [],
  localToServerIds: {},

  setLocalToServerId: (localId: string, serverId: string) => {
    set((state) => ({
      localToServerIds: { ...state.localToServerIds, [localId]: serverId },
    }));
  },

  addPendingUpload: (localConversationId: string, audioUri: string, audioKey: string) => {
    const serverId = get().localToServerIds[localConversationId];
    if (serverId) {
      // If server ID is available, upload immediately
      get().uploadAudio(audioUri, serverId, audioKey);
    } else {
      // Otherwise, queue it for later upload
      set((state) => ({
        pendingUploads: [
          ...state.pendingUploads,
          { conversationId: localConversationId, audioUri, audioKey },
        ],
      }));
    }
  },

  processPendingUploads: (localConversationId: string) => {
    const state = get();
    const serverId = state.localToServerIds[localConversationId];
    if (!serverId) return;

    const pending = state.pendingUploads.filter(
      (p) => p.localConversationId === localConversationId
    );
    pending.forEach((p) => {
      state.uploadAudio(p.audioUri, serverId, p.audioKey);
    });
    // Remove processed uploads from the queue
    set((state) => ({
      pendingUploads: state.pendingUploads.filter(
        (p) => p.localConversationId !== localConversationId
      ),
    }));
  },

  uploadAudio: async (audioUri: string, conversationId: string, audioKey: string) => {
    const token = await getClerkInstance().session?.getToken();
    if (!token) throw new Error("No authentication token");

    const uploadId = `${conversationId}_${audioKey}`;

    try {
      // First attempt foreground upload
      const uploadTask = FileSystem.createUploadTask(
        `${API_BASE_URL}/audio/upload`,
        audioUri,
        {
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "audio",
          parameters: { conversationId, audioKey },
          headers: {
            Authorization: `Bearer ${token}`,
          },
          mimeType: "audio/m4a",
        },
        (progress) => {
          if (progress.totalBytesExpectedToSend > 0) {
            const percentComplete =
              (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100;
            set((state) => ({
              uploadProgress: {
                ...state.uploadProgress,
                [uploadId]: percentComplete,
              },
            }));
          }
        }
      );

      const response = await uploadTask.uploadAsync();
      
      if (response && (response.status === 200 || response.status === 201)) {
        const result = JSON.parse(response.body);
        set((state) => ({
          uploadResults: {
            ...state.uploadResults,
            [uploadId]: { success: true, url: result.url },
          },
          uploadProgress: {
            ...state.uploadProgress,
            [uploadId]: 100,
          },
        }));

        // Clean up the local audio file after successful upload
        await FileSystem.deleteAsync(audioUri, { idempotent: true });
      } else {
        throw new Error(response ? `Upload failed with status ${response.status}` : "Network error");
      }
    } catch (error) {
      console.error("Upload failed, scheduling background retry:", error);
      
      // Schedule background retry
      try {
        if (!conversationId) {
          throw new Error("Conversation ID is required for background upload");
        }

        await BackgroundFetch.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
          minimumInterval: 60, // Retry every minute
          stopOnTerminate: false,
          startOnBoot: true,
        });

        // Store the upload data in state for the background task to access
        const pendingUpload: PendingUpload = {
          audioUri,
          conversationId,
          audioKey,
        };

        const uploadResult: UploadResult = {
          success: false,
          error: error instanceof Error ? error.message : "Network error",
          audioUri,
          conversationId,
          audioKey,
        };

        set((state) => {
          const updatedPendingUploads: PendingUpload[] = [...state.pendingUploads, pendingUpload];
          const updatedUploadResults = {
            ...state.uploadResults,
            [uploadId]: uploadResult,
          };
          
          return {
            pendingUploads: updatedPendingUploads,
            uploadResults: updatedUploadResults,
            uploadProgress: state.uploadProgress,
            localToServerIds: state.localToServerIds,
          };
        });
      } catch (scheduleError) {
        console.error("Failed to schedule background upload:", scheduleError);
        throw error; // Re-throw the original error if we can't schedule background upload
      }
    }
  },

  retryUpload: (uploadId: string) => {
    const state = get();
    const result = state.uploadResults[uploadId];
    if (result && !result.success) {
      const { audioUri, conversationId, audioKey } = result;
      state.uploadAudio(audioUri, conversationId, audioKey);
    }
  },

  clearUploadState: (conversationId: string) => {
    set((state) => {
      const newProgress = { ...state.uploadProgress };
      const newResults = { ...state.uploadResults };
      
      // Get all upload IDs for this conversation
      const uploadIds = Object.keys(newProgress).filter(key => 
        key.startsWith(conversationId)
      );

      // Clean up files and cancel background tasks
      uploadIds.forEach(async (uploadId) => {
        const result = newResults[uploadId];
        if (!result?.success && result?.audioUri) {
          try {
            // Clean up local file if it exists
            const fileInfo = await FileSystem.getInfoAsync(result.audioUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(result.audioUri, { idempotent: true });
            }
            
            // Unregister background task if it exists
            if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPLOAD_TASK)) {
              await BackgroundFetch.unregisterTaskAsync(BACKGROUND_UPLOAD_TASK);
            }
          } catch (err) {
            console.error('Failed to clean up upload resources:', err);
          }
        }
        delete newProgress[uploadId];
        delete newResults[uploadId];
      });

      return {
        uploadProgress: newProgress,
        uploadResults: newResults,
      };
    });
  },
});