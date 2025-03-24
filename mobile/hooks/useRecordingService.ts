import { useCallback, useEffect, useState } from "react";

import {
  recordingService,
} from "@/services/RecordingService";

import type { RecordingMode, RecordingStatus } from "@/types/recording";

/**
 * Hook for using the RecordingService
 * Provides direct access to service methods with React state updates
 */
export function useRecordingService() {
  // State tracking
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>(
    () => recordingService.getStatus().status
  );
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentPartner, setCurrentPartner] = useState<1 | 2>(1);
  const [isReleased, setIsReleased] = useState<boolean>(false);

  // Set up event listeners
  useEffect(() => {
    // Status change listener
    const unsubscribeStatus = recordingService.addEventListener(
      "status-change",
      (status: RecordingStatus) => {
        setRecordingStatus(status);
      }
    );
    
    // Progress update listener
    const unsubscribeProgress = recordingService.addEventListener(
      "progress-update",
      (progress: number) => {
        setProcessingProgress(progress);
      }
    );
    
    // Error listener
    const unsubscribeError = recordingService.addEventListener(
      "error",
      (errorMsg: string) => {
        setError(errorMsg);
      }
    );
    
    // Status timer for sync
    const statusTimer = setInterval(() => {
      const status = recordingService.getStatus();
      setRecordingDuration(status.recordingDuration ?? 0);
      setConversationId(status.conversationId);
      setCurrentPartner(status.currentPartner);
      setIsReleased(status.isReleased ?? false);
    }, 500);
    
    return () => {
      unsubscribeStatus();
      unsubscribeProgress();
      unsubscribeError();
      clearInterval(statusTimer);
    };
  }, []);
  
  return {
    // Status information
    recordingStatus,
    recordingDuration,
    processingProgress,
    error,
    conversationId,
    currentPartner,
    isRecording: recordingStatus === "recording",
    isReleased,
    
    // Direct service access
    service: recordingService,
    
    // Convenience methods
    initializeConversation: useCallback(
      (modeId: string, mode: RecordingMode) => 
        recordingService.initializeConversation(modeId, mode),
      []
    ),
    
    startRecording: useCallback(
      () => recordingService.startRecording(),
      []
    ),
    
    stopRecording: useCallback(
      () => recordingService.stopRecording(),
      []
    ),
    
    uploadRecordings: useCallback(
      (onProgress?: (progress: number) => void) => 
        recordingService.uploadRecordings(onProgress),
      []
    ),
    
    releaseRecordings: useCallback(
      () => recordingService.releaseRecordings(),
      []
    ),
    
    reset: useCallback(
      () => recordingService.reset(),
      []
    ),
    
    setRecordingMode: useCallback(
      (mode: RecordingMode) => recordingService.setRecordingMode(mode),
      []
    ),
    
    pollForResults: useCallback(
      (options?: {
        onProgress?: (progress: number) => void;
        onComplete?: () => void;
        onError?: (error: Error) => void;
      }) => recordingService.pollForResults(options),
      []
    ),
  };
}