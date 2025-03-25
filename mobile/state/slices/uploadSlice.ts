import * as FileSystem from "expo-file-system";
import { StateCreator } from "zustand";
import { API_BASE_URL, PendingUpload, StoreState, UploadResult } from "../types";

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
          { localConversationId, audioUri, audioKey },
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

  uploadAudio: (audioUri: string, conversationId: string, audioKey: string) => {
    const token = get().token || get().fetchToken();
    if (!token) throw new Error("No authentication token");

    const uploadId = `${conversationId}_${audioKey}`;

    return new Promise<void>((resolve, reject) => {
      const uploadTask = FileSystem.createUploadTask(
        `${API_BASE_URL}/audio`,
        audioUri,
        {
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "audio",
          parameters: { conversationId, audioKey }, // Include audioKey for server identification
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

      uploadTask
        .uploadAsync()
        .then((response) => {
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
            FileSystem.deleteAsync(audioUri).catch((error) => {
              console.error("Failed to delete audio file:", error);
            });
            resolve();
          } else {
            set((state) => ({
              uploadResults: {
                ...state.uploadResults,
                [uploadId]: {
                  success: false,
                  error: response
                    ? `Upload failed with status ${response.status}`
                    : "Network error",
                  audioUri, // Preserve for retry
                  conversationId,
                  audioKey,
                },
              },
            }));
            reject(
              new Error(
                response ? `Upload failed with status ${response.status}` : "Network error"
              )
            );
          }
        })
        .catch((error) => {
          set((state) => ({
            uploadResults: {
              ...state.uploadResults,
              [uploadId]: {
                success: false,
                error: error instanceof Error ? error.message : "Network error",
                audioUri, // Preserve for retry
                conversationId,
                audioKey,
              },
            },
          }));
          reject(error);
        });
    });
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
      Object.keys(newProgress).forEach((key) => {
        if (key.startsWith(conversationId)) {
          delete newProgress[key];
          delete newResults[key];
        }
      });
      return {
        uploadProgress: newProgress,
        uploadResults: newResults,
      };
    });
  },
});