import { recordingService } from "@/services/RecordingService";
import { handleError } from "@/utils/errorUtils";
import { useCallback, useEffect, useState } from "react";
import { useRecordingStore } from "./useTypedStore";

export interface RecordingUploadState {
  isUploading: boolean;
  uploadProgress: number;
  isReadyToUpload: boolean;
  uploadsComplete: boolean;
  uploadError: string | null;
}

export interface RecordingUploadHook extends RecordingUploadState {
  startUpload: () => Promise<boolean>;
  resetUpload: () => void;
}

/**
 * Hook for managing recording uploads
 */
export function useRecordingUpload(
  conversationId: string | null,
  recordingMode: "separate" | "live",
  audioUris: {
    partner1?: string | null;
    partner2?: string | null;
    live?: string | null;
  }
): RecordingUploadHook {
  // State
  const [state, setState] = useState<RecordingUploadState>({
    isUploading: false,
    uploadProgress: 0,
    isReadyToUpload: false,
    uploadsComplete: false,
    uploadError: null
  });

  // Store integration
  const { setRecordingError } = useRecordingStore();

  // Helper to update state
  const updateState = useCallback((updates: Partial<RecordingUploadState>) => {
    setState((prevState) => ({ ...prevState, ...updates }));
  }, []);

  // Check if ready to upload when URIs change
  useEffect(() => {
    const isReady = recordingMode === "live" 
      ? !!audioUris.live
      : !!audioUris.partner1 && !!audioUris.partner2;

    updateState({ isReadyToUpload: isReady });
  }, [recordingMode, audioUris, updateState]);

  /**
   * Start the upload process
   */
  const startUpload = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      updateState({ 
        uploadError: "No conversation ID available",
        isReadyToUpload: false
      });
      return false;
    }

    updateState({ 
      isUploading: true,
      uploadError: null
    });

    try {
      const success = await recordingService.uploadRecordings((progress) => {
        updateState({ uploadProgress: progress });
      });

      if (success) {
        updateState({
          uploadsComplete: true,
          isReadyToUpload: false,
          isUploading: false
        });
      } else {
        throw new Error("Upload failed");
      }

      return success;
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: "Upload failed",
        serviceName: "Recording",
        errorType: "UPLOAD_ERROR",
        severity: "ERROR",
        metadata: { conversationId }
      });

      updateState({
        uploadError: message,
        isReadyToUpload: false,
        isUploading: false
      });
      setRecordingError(message);
      return false;
    }
  }, [conversationId, updateState, setRecordingError]);

  /**
   * Reset upload state
   */
  const resetUpload = useCallback(() => {
    setState({
      isUploading: false,
      uploadProgress: 0,
      isReadyToUpload: false,
      uploadsComplete: false,
      uploadError: null
    });
  }, []);

  return {
    ...state,
    startUpload,
    resetUpload
  };
} 