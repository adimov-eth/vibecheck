import { useCallback, useEffect } from "react";
import { useRecordingControls } from "./useRecordingControls";
import { useRecordingStatus } from "./useRecordingStatus";
import { useRecordingUpload } from "./useRecordingUpload";

export interface RecordingFlowHook {
  // Recording controls
  recordMode: "separate" | "live";
  currentPartner: 1 | 2;
  isRecording: boolean;
  recordingDuration: number;
  handleToggleRecording: () => Promise<void>;
  handleToggleMode: (index: number) => void;
  
  // Upload state
  isUploading: boolean;
  uploadProgress: number;
  
  // Processing state
  isProcessing: boolean;
  processingProgress: number;
  processingComplete: boolean;
  
  // Status and errors
  error: string | null;
  isUsingWebSocket: boolean;
  isWebSocketConnected: boolean;
  
  // Resources
  conversationId: string | null;
  partner1Uri: string | null;
  partner2Uri: string | null;
  audioUri: string | null;
  
  // Cleanup
  cleanup: () => Promise<void>;
}

/**
 * Main hook for managing the complete recording flow
 * Coordinates between recording, upload, and status tracking
 */
export function useRecordingFlow(
  selectedModeId: string,
  onRecordingComplete: (conversationId: string) => void
): RecordingFlowHook {
  // Initialize sub-hooks
  const controls = useRecordingControls(selectedModeId);
  
  const upload = useRecordingUpload(
    controls.conversationId,
    controls.recordMode,
    {
      partner1: controls.partner1Uri,
      partner2: controls.partner2Uri,
      live: controls.audioUri
    }
  );
  
  const status = useRecordingStatus(
    controls.conversationId,
    onRecordingComplete
  );

  // Start upload when ready
  useEffect(() => {
    if (upload.isReadyToUpload && !upload.uploadsComplete && !status.processingComplete) {
      upload.startUpload().then((success) => {
        if (success && !status.isUsingWebSocket) {
          status.startProcessingPolling();
        }
      });
    }
  }, [upload.isReadyToUpload, upload.uploadsComplete, status.processingComplete]);

  // Enhanced cleanup that coordinates all sub-hooks
  const cleanup = useCallback(async () => {
    status.resetStatus();
    upload.resetUpload();
    await controls.cleanup();
  }, [status, upload, controls]);

  return {
    // Recording controls
    recordMode: controls.recordMode,
    currentPartner: controls.currentPartner,
    isRecording: controls.isRecording,
    recordingDuration: controls.recordingDuration,
    handleToggleRecording: controls.handleToggleRecording,
    handleToggleMode: controls.handleToggleMode,
    
    // Upload state
    isUploading: upload.isUploading,
    uploadProgress: upload.uploadProgress,
    
    // Processing state
    isProcessing: !upload.uploadsComplete && upload.isReadyToUpload,
    processingProgress: status.processingProgress,
    processingComplete: status.processingComplete,
    
    // Status and errors
    error: controls.error || upload.uploadError || status.processingError,
    isUsingWebSocket: status.isUsingWebSocket,
    isWebSocketConnected: status.isWebSocketConnected,
    
    // Resources
    conversationId: controls.conversationId,
    partner1Uri: controls.partner1Uri,
    partner2Uri: controls.partner2Uri,
    audioUri: controls.audioUri,
    
    // Cleanup
    cleanup
  };
}