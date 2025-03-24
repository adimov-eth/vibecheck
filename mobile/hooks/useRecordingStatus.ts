import { recordingService } from "@/services/RecordingService";
import { handleError } from "@/utils/errorUtils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketWithNetwork } from "./useWebSocketWithNetwork";

export interface RecordingStatusState {
  processingProgress: number;
  processingComplete: boolean;
  processingError: string | null;
  isUsingWebSocket: boolean;
  isWebSocketConnected: boolean;
}

export interface RecordingStatusHook extends RecordingStatusState {
  startProcessingPolling: (options?: {
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  }) => () => void;
  resetStatus: () => void;
}

/**
 * Hook for tracking recording processing status
 */
export function useRecordingStatus(
  conversationId: string | null,
  onProcessingComplete?: (conversationId: string) => void
): RecordingStatusHook {
  // State
  const [state, setState] = useState<RecordingStatusState>({
    processingProgress: 0,
    processingComplete: false,
    processingError: null,
    isUsingWebSocket: false,
    isWebSocketConnected: false
  });

  // WebSocket integration
  const { isConnected: isWebSocketConnected } = useWebSocketWithNetwork({
    subscribeToTopics: conversationId ? [`conversation:${conversationId}`] : []
  });

  // Refs for cleanup
  const stopPollingRef = useRef<(() => void) | null>(null);
  const isUsingWebSocketRef = useRef(false);

  // Helper to update state
  const updateState = useCallback((updates: Partial<RecordingStatusState>) => {
    setState((prevState) => ({ ...prevState, ...updates }));
  }, []);

  // Update WebSocket status when connection changes
  useEffect(() => {
    const isUsingWebSocket = isWebSocketConnected && !!conversationId;
    isUsingWebSocketRef.current = isUsingWebSocket;
    updateState({ 
      isUsingWebSocket,
      isWebSocketConnected 
    });
  }, [isWebSocketConnected, conversationId, updateState]);

  // Set up event listeners
  useEffect(() => {
    const unsubscribeProgress = recordingService.addEventListener(
      "progress-update",
      (progress: number) => {
        updateState({ processingProgress: progress });
      }
    );

    const unsubscribeProcessingComplete = recordingService.addEventListener(
      "processing-complete",
      (completedConversationId: string) => {
        updateState({ 
          processingComplete: true,
          processingProgress: 100
        });

        if (onProcessingComplete) {
          onProcessingComplete(completedConversationId);
        }
      }
    );

    return () => {
      unsubscribeProgress();
      unsubscribeProcessingComplete();
    };
  }, [updateState, onProcessingComplete]);

  /**
   * Start polling for processing status
   */
  const startProcessingPolling = useCallback((options: {
    onProgress?: (progress: number) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  } = {}): (() => void) => {
    // Don't start polling if using WebSocket
    if (isUsingWebSocketRef.current) {
      return () => {};
    }

    // Stop any existing polling
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }

    const stopPolling = recordingService.pollForResults({
      onProgress: (progress) => {
        updateState({ processingProgress: progress });
        if (options.onProgress) {
          options.onProgress(progress);
        }
      },
      onComplete: () => {
        updateState({ 
          processingComplete: true,
          processingProgress: 100
        });
        if (options.onComplete) {
          options.onComplete();
        }
      },
      onError: (error) => {
        const { message } = handleError(error, {
          defaultMessage: "Processing failed",
          serviceName: "Recording"
        });
        updateState({ processingError: message });
        if (options.onError) {
          options.onError(error);
        }
      }
    });

    stopPollingRef.current = stopPolling;
    return stopPolling;
  }, [updateState]);

  /**
   * Reset status state
   */
  const resetStatus = useCallback(() => {
    // Stop any active polling
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }

    setState({
      processingProgress: 0,
      processingComplete: false,
      processingError: null,
      isUsingWebSocket: false,
      isWebSocketConnected: false
    });
  }, []);

  return {
    ...state,
    startProcessingPolling,
    resetStatus
  };
} 