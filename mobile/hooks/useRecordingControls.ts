import {
  recordingService
} from "@/services/RecordingService";
import type { RecordingMode, RecordingStatus } from "@/types/recording";
import { handleError } from "@/utils/errorUtils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingStore } from "./useTypedStore";

export interface RecordingControlsState {
  recordMode: RecordingMode;
  currentPartner: 1 | 2;
  recordingStatus: RecordingStatus;
  recordingDuration: number;
  conversationId: string | null;
  partner1Uri: string | null;
  partner2Uri: string | null;
  audioUri: string | null;
  error: string | null;
}

export interface RecordingControlsHook extends RecordingControlsState {
  handleToggleRecording: () => Promise<void>;
  handleToggleMode: (index: number) => void;
  cleanup: () => Promise<void>;
  isRecording: boolean;
}

/**
 * Hook for managing recording controls and basic state
 */
export function useRecordingControls(
  selectedModeId: string
): RecordingControlsHook {
  // State
  const [state, setState] = useState<RecordingControlsState>({
    recordMode: "separate",
    currentPartner: 1,
    recordingStatus: recordingService.getStatus().status,
    recordingDuration: 0,
    conversationId: null,
    partner1Uri: null,
    partner2Uri: null,
    audioUri: null,
    error: null
  });

  // Store integration
  const { clearRecordings, setRecordingError } = useRecordingStore();

  // Operation lock to prevent race conditions
  const isOperationInProgressRef = useRef(false);

  // Cleanup tracking
  const cleanupInitiatedRef = useRef(false);

  // Helper to update state
  const updateState = useCallback((updates: Partial<RecordingControlsState>) => {
    setState((prevState) => ({ ...prevState, ...updates }));
  }, []);

  // Set up event listeners
  useEffect(() => {
    // Status change listener
    const unsubscribeStatus = recordingService.addEventListener(
      "status-change",
      (status: RecordingStatus) => {
        updateState({ recordingStatus: status });
      }
    );

    // Recording complete listener
    const unsubscribeRecordingComplete = recordingService.addEventListener(
      "recording-complete",
      (result) => {
        if (state.recordMode === "live") {
          updateState({
            audioUri: result.uri
          });
        } else {
          if (result.partner === 1) {
            updateState({
              partner1Uri: result.uri,
              currentPartner: 2
            });
          } else {
            updateState({
              partner2Uri: result.uri
            });
          }
        }
        isOperationInProgressRef.current = false;
      }
    );

    // Error listener
    const unsubscribeError = recordingService.addEventListener(
      "error",
      (error: string) => {
        updateState({ error });
        setRecordingError(error);
        isOperationInProgressRef.current = false;
      }
    );

    // Status timer for sync
    const statusTimer = setInterval(() => {
      const status = recordingService.getStatus();
      updateState({ recordingDuration: status.recordingDuration });
    }, 500);

    // Cleanup on unmount
    return () => {
      unsubscribeStatus();
      unsubscribeRecordingComplete();
      unsubscribeError();
      clearInterval(statusTimer);
    };
  }, [state.recordMode, updateState, setRecordingError]);

  /**
   * Initialize recording session
   */
  const initializeRecording = useCallback(async (): Promise<string | null> => {
    if (!selectedModeId) return null;

    try {
      // Set recording mode
      recordingService.setRecordingMode(state.recordMode);

      // Initialize conversation
      const conversationId = await recordingService.initializeConversation(
        selectedModeId,
        state.recordMode
      );

      // Update local state
      updateState({ conversationId });

      return conversationId;
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: "Failed to create conversation",
        serviceName: "Recording"
      });

      updateState({ error: message });
      setRecordingError(message);
      return null;
    }
  }, [selectedModeId, state.recordMode, updateState, setRecordingError]);

  /**
   * Handle recording toggle with debounce
   */
  const handleToggleRecording = useCallback(async () => {
    if (isOperationInProgressRef.current) return;
    isOperationInProgressRef.current = true;

    try {
      if (state.recordingStatus === "recording") {
        await recordingService.stopRecording();
      } else {
        if (state.recordMode === "separate" || state.recordMode === "live") {
          recordingService.reset();
          clearRecordings();
          const conversationId = await initializeRecording();
          if (!conversationId) {
            isOperationInProgressRef.current = false;
            return;
          }
        }
        await recordingService.startRecording();
      }
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: "Error toggling recording",
        serviceName: "Recording",
        showToast: true
      });
      setRecordingError(message);
      isOperationInProgressRef.current = false;
    }
  }, [
    state.recordingStatus,
    state.recordMode,
    clearRecordings,
    initializeRecording,
    setRecordingError
  ]);

  /**
   * Handle toggle between recording modes
   */
  const handleToggleMode = useCallback((index: number): void => {
    const newMode = index === 0 ? "separate" : "live";
    updateState({ recordMode: newMode });
    recordingService.setRecordingMode(newMode);
  }, [updateState]);

  /**
   * Cleanup function
   */
  const cleanup = useCallback(async (): Promise<void> => {
    if (!cleanupInitiatedRef.current) {
      cleanupInitiatedRef.current = true;
      try {
        await recordingService.releaseRecordings();
      } catch (error) {
        const { message } = handleError(error, {
          defaultMessage: "Error releasing recordings",
          serviceName: "Recording"
        });
        console.error(message);
      }
    }
  }, []);

  return {
    ...state,
    handleToggleRecording,
    handleToggleMode,
    cleanup,
    isRecording: state.recordingStatus === "recording"
  };
} 