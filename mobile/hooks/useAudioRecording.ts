import { useCallback, useEffect, useState } from "react";

import { recordingService } from "@/services/RecordingService";
import type { RecordingStatus } from "@/types/recording";

/**
 * Audio recording hook interface
 */
export interface AudioRecordingHook {
  isRecording: boolean;
  hasPermission: boolean;
  recordingStatus: RecordingStatus;
  recordingDuration: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<string | null>;
  releaseRecordings: () => Promise<void>;
  isReleased: boolean;
}

/**
 * Hook for audio recording functionality
 * This is a simple wrapper around RecordingService
 */
export function useAudioRecording(): AudioRecordingHook {
  // State for UI updates
  const [status, setStatus] = useState<RecordingStatus>(
    () => recordingService.getStatus().status
  );
  const [duration, setDuration] = useState<number>(0);
  const [isReleased, setIsReleased] = useState<boolean>(
    recordingService.getStatus().isReleased ?? false
  );
  const [hasPermission, setHasPermission] = useState<boolean>(
    recordingService.getStatus().hasPermission ?? false
  );

  // Update UI on status change
  useEffect(() => {
    const unsubscribeStatus = recordingService.addEventListener(
      "status-change",
      (newStatus: RecordingStatus) => {
        setStatus(newStatus);
      }
    );
    
    // Set up a timer to sync UI state with service state
    const statusTimer = setInterval(() => {
      const serviceStatus = recordingService.getStatus();
      setDuration(serviceStatus.recordingDuration ?? 0);
      setIsReleased(serviceStatus.isReleased ?? false);
      setHasPermission(serviceStatus.hasPermission ?? false);
    }, 500);
    
    return () => {
      unsubscribeStatus();
      clearInterval(statusTimer);
    };
  }, []);
  
  /**
   * Start recording
   */
  const startRecording = useCallback(async (): Promise<boolean> => {
    return recordingService.startRecording();
  }, []);
  
  /**
   * Stop recording and save it
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const result = await recordingService.stopRecording();
    return result?.uri || null;
  }, []);
  
  /**
   * Release recording resources
   */
  const releaseRecordings = useCallback(async (): Promise<void> => {
    await recordingService.releaseRecordings();
  }, []);
  
  return {
    isRecording: status === "recording",
    hasPermission,
    recordingStatus: status,
    recordingDuration: duration,
    startRecording,
    stopRecording,
    releaseRecordings,
    isReleased,
  };
}