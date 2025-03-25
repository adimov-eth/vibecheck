import { useEffect, useState } from 'react';
import useStore from '../state/index';
import type { WebSocketMessage } from '../state/types';

interface ConversationResult {
  transcript?: string;
  analysis?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
  progress: number;
}

export const useConversationResult = (conversationId: string) => {
  const [data, setData] = useState<ConversationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const {
    wsMessages,
    socket,
    connectWebSocket,
    subscribeToConversation,
    unsubscribeFromConversation,
    clearMessages,
    clearUploadState,
  } = useStore();

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const attemptSubscription = () => {
      if (socket?.readyState === WebSocket.OPEN && mounted) {
        subscribeToConversation(conversationId);
        return true;
      }
      return false;
    };

    const setupWebSocket = async () => {
      try {
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          await connectWebSocket();
        }

        // Initial subscription attempt
        if (!attemptSubscription() && retryCount < maxRetries) {
          // Set up retry with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          retryCount++;
          
          setTimeout(() => {
            if (mounted && !attemptSubscription() && retryCount < maxRetries) {
              setupWebSocket();
            }
          }, retryDelay);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to connect to WebSocket'));
          setIsLoading(false);
        }
      }
    };

    setupWebSocket();

    return () => {
      mounted = false;
      unsubscribeFromConversation(conversationId);
    };
  }, [conversationId, socket, connectWebSocket, subscribeToConversation, unsubscribeFromConversation]);

  useEffect(() => {
    const relevantMessages = wsMessages.filter(
      (msg) => msg.payload.conversationId === conversationId
    );

    if (relevantMessages.length === 0) {
      setData({
        status: 'processing',
        progress: 0,
      });
      setIsLoading(true);
      return;
    }

    const result: ConversationResult = {
      status: 'processing',
      progress: 0,
    };

    relevantMessages.forEach((msg: WebSocketMessage) => {
      switch (msg.type) {
        case 'transcript':
          result.transcript = msg.payload.content;
          result.progress = 50;
          break;
        case 'analysis':
          result.analysis = msg.payload.content;
          result.progress = 100;
          break;
        case 'error':
          result.status = 'error';
          result.error = msg.payload.error;
          result.progress = 100;
          clearUploadState(conversationId);
          break;
        case 'status':
          if (msg.payload.status === 'conversation_completed') {
            result.status = 'completed';
            result.analysis = msg.payload.gptResponse;
            result.progress = 100;
            clearUploadState(conversationId);
          } else if (msg.payload.status === 'error') {
            result.status = 'error';
            result.error = msg.payload.error;
            result.progress = 100;
            clearUploadState(conversationId);
          }
          break;
      }
    });

    setData(result);
    setIsLoading(false);
  }, [wsMessages, conversationId, clearUploadState]);

  useEffect(() => {
    return () => {
      if (data?.status === 'processing') {
        clearUploadState(conversationId);
      }
    };
  }, [conversationId, data?.status, clearUploadState]);

  const refetch = async () => {
    setIsLoading(true);
    setError(null);
    clearMessages();
    subscribeToConversation(conversationId);
  };

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}; 