import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  webSocketService,
  type WebSocketMessage,
  type WebSocketMessageType,
  type WebSocketPayloads,
} from "@/services/WebSocketService";
import { useStore } from "@/store";
import { ConversationStatus } from "@/types/conversation";
import { useConversations } from "./useApi";
import { useWebSocketWithNetwork } from "./useWebSocketWithNetwork";

/**
 * WebSocket connection state
 */
export interface WebSocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
}

/**
 * Hook for using the WebSocket service
 */
export function useWebSocket() {
  const { isSignedIn } = useAuth();
  const [connectionState, setConnectionState] = useState<WebSocketState>({
    isConnected: webSocketService.isConnected(),
    isAuthenticated: webSocketService.isAuthenticated(),
  });

  useEffect(() => {
    // Only initialize WebSocket if user is signed in
    if (isSignedIn) {
      webSocketService.init();

      // Subscribe to connection state changes
      const unsubscribe = webSocketService.addListener(
        (state: { connected: boolean; authenticated: boolean }) => {
          setConnectionState({
            isConnected: state.connected,
            isAuthenticated: state.authenticated,
          });
        },
      );

      return unsubscribe;
    } else {
      // Disconnect if user is not signed in
      webSocketService.disconnect();
      setConnectionState({
        isConnected: false,
        isAuthenticated: false,
      });
    }
  }, [isSignedIn]);

  const send = useCallback(
    (type: WebSocketMessageType, payload: WebSocketPayloads[WebSocketMessageType], topic?: string) => {
      if (!isSignedIn) {
        console.warn("Cannot send WebSocket message when not signed in");
        return;
      }
      webSocketService.send({ type, payload, topic });
    },
    [isSignedIn],
  );

  const subscribe = useCallback((topic: string) => {
    if (!isSignedIn) {
      console.warn("Cannot subscribe to WebSocket topic when not signed in");
      return;
    }
    webSocketService.subscribe(topic);
  }, [isSignedIn]);

  const unsubscribe = useCallback((topic: string) => {
    webSocketService.unsubscribe(topic);
  }, []);

  return {
    ...connectionState,
    send,
    subscribe,
    unsubscribe,
  };
}

/**
 * Hook for subscribing to WebSocket messages by type
 * @param type Message type to subscribe to
 * @param handler Message handler function
 */
export function useWebSocketMessage(
  type: WebSocketMessageType,
  handler: (message: WebSocketMessage) => void,
) {
  useEffect(() => {
    const unsubscribe = webSocketService.onMessage(type, handler);
    return unsubscribe;
  }, [type, handler]);
}

/**
 * Hook for using WebSocket for conversation results
 * @param conversationId Conversation ID
 */
export function useWebSocketResults(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const { setProcessingProgress: setStoreProgress, updateAudioStatus, setRecordingError } =
    useStore();
  
  // Get the pollForCompletion function from the API hook
  const { pollForCompletion } = useConversations();
  
  // Use the enhanced WebSocket hook with network awareness
  const { isConnected } = useWebSocketWithNetwork({
    subscribeToTopics: conversationId ? [`conversation:${conversationId}`] : [],
  });

  // Track if we're using the WebSocket or fallback polling
  const isUsingWebSocketRef = useRef(false);
  // Track if polling is active
  const isPollingActiveRef = useRef(false);

  // Update WebSocket usage flag when connection status changes
  useEffect(() => {
    if (conversationId) {
      isUsingWebSocketRef.current = isConnected;
    }
  }, [conversationId, isConnected]);

  // Fallback to polling when WebSocket disconnects during processing
  useEffect(() => {
    if (!isConnected && conversationId && isProcessing && !isPollingActiveRef.current) {
      console.log(`WebSocket disconnected during processing for conversation ${conversationId}, falling back to polling`);
      isPollingActiveRef.current = true;
      
      const stopPolling = pollForCompletion(conversationId, {
        onProgress: (progress) => setStoreProgress(progress),
        onComplete: () => {
          setIsProcessing(false);
          isPollingActiveRef.current = false;
          queryClient.invalidateQueries({ 
            queryKey: ["conversation", conversationId, "result"] 
          });
        },
        onError: (error) => {
          setError(error.message);
          isPollingActiveRef.current = false;
        },
      });
      
      return stopPolling;
    }
    
    // Reset polling flag when WebSocket reconnects
    if (isConnected && isPollingActiveRef.current) {
      isPollingActiveRef.current = false;
    }
  }, [
    isConnected, 
    conversationId, 
    isProcessing, 
    pollForCompletion, 
    setStoreProgress, 
    queryClient, 
    setError
  ]);

  // Handle conversation progress updates
  useWebSocketMessage(
    "conversation_progress",
    useCallback(
      (message: WebSocketMessage) => {
        if (!conversationId) return;

        // Check if this message is for our conversation
        if (message.topic !== `conversation:${conversationId}`) return;

        const progress = (message.payload as { progress: number }).progress;
        if (typeof progress === "number") {
          const progressPercent = Math.round(progress * 100);
          // Update progress in store and local state
          setStoreProgress(progressPercent);
          setProcessingProgress(progressPercent);
          setIsProcessing(true);

          // Update query cache
          queryClient.setQueryData(
            ["conversation", conversationId, "status"],
            (oldData: ConversationStatus) => ({
              ...(oldData || {}),
              status: "processing",
              progress,
            }),
          );
        }
      },
      [conversationId, setStoreProgress, queryClient],
    ),
  );

  // Handle conversation completed events
  useWebSocketMessage(
    "conversation_completed",
    useCallback(
      (message: WebSocketMessage) => {
        if (!conversationId) return;

        // Check if this message is for our conversation
        if (message.topic !== `conversation:${conversationId}`) return;

        console.log(
          `Conversation ${conversationId} completed via WebSocket notification`,
        );

        // Set progress to 100%
        setStoreProgress(100);
        setIsProcessing(false);

        // Update query cache with completed status
        queryClient.setQueryData(["conversation", conversationId, "status"], {
          status: "completed",
          progress: 1.0,
        });

        // Invalidate the results query to trigger a fetch
        queryClient.invalidateQueries({
          queryKey: ["conversation", conversationId, "result"],
        });
      },
      [conversationId, setStoreProgress, queryClient],
    ),
  );

  // Handle conversation error
  useWebSocketMessage(
    "conversation_error",
    useCallback(
      (message: WebSocketMessage) => {
        if (!conversationId) return;

        // Check if this message is for our conversation
        if (message.topic !== `conversation:${conversationId}`) return;

        const errorMessage = (message.payload as { error: string }).error || "Unknown error";
        console.error(`Conversation ${conversationId} error:`, errorMessage);

        setError(errorMessage);
        setIsProcessing(false);
        setRecordingError(errorMessage);

        // Update query cache
        queryClient.setQueryData(["conversation", conversationId, "status"], {
          status: "error",
          error: errorMessage,
        });
      },
      [conversationId, setRecordingError, queryClient],
    ),
  );

  // Handle conversation failure
  useWebSocketMessage(
    "conversation_failed",
    useCallback(
      (message: WebSocketMessage) => {
        if (!conversationId) return;

        // Check if this message is for our conversation
        if (message.topic !== `conversation:${conversationId}`) return;

        const errorMessage = (message.payload as { error: string }).error || "Processing failed";
        console.error(`Conversation ${conversationId} failed:`, errorMessage);

        setError(errorMessage);
        setIsProcessing(false);
        setRecordingError(errorMessage);

        // Update query cache
        queryClient.setQueryData(["conversation", conversationId, "status"], {
          status: "error",
          error: errorMessage,
        });
      },
      [conversationId, setRecordingError, queryClient],
    ),
  );

  // Handle audio processing completion
  useWebSocketMessage(
    "audio_processed",
    useCallback(
      (message: WebSocketMessage) => {
        const audioId = Number((message.payload as { audioId: number }).audioId);
        if (!audioId) return;

        console.log(`Audio ${audioId} processed successfully`);

        updateAudioStatus(audioId, { status: "transcribed" });
      },
      [updateAudioStatus],
    ),
  );

  // Handle audio processing failure
  useWebSocketMessage(
    "audio_failed",
    useCallback(
      (message: WebSocketMessage) => {
        const audioId = Number((message.payload as { audioId: number }).audioId);
        if (!audioId) return;

        const errorMessage = (message.payload as { error: string }).error || "Unknown error";
        console.error(`Audio ${audioId} processing failed:`, errorMessage);

        updateAudioStatus(audioId, {
          status: "failed",
          error: errorMessage,
        });

        setError(`Audio processing failed: ${errorMessage}`);
        setRecordingError(`Audio processing failed: ${errorMessage}`);
      },
      [updateAudioStatus, setRecordingError],
    ),
  );

  return {
    isProcessing,
    error,
    isUsingWebSocket: isUsingWebSocketRef.current,
    isWebSocketConnected: isConnected,
    processingProgress
  };
}
