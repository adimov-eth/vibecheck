import { useEffect, useState } from 'react';
import useStore from '../state/index';
import type { WebSocketMessage } from '../state/types';

interface ConversationResult {
  transcript?: string;
  analysis?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
  progress: number;
  additionalData?: {
    category?: 'mediator' | 'counselor' | 'dinner' | 'movie';
  };
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
    clearMessages 
  } = useStore();

  // Connect to WebSocket and subscribe to conversation updates
  useEffect(() => {
    const setupWebSocket = async () => {
      try {
        if (!socket) {
          await connectWebSocket();
        }
        subscribeToConversation(conversationId);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to connect to WebSocket'));
      }
    };

    setupWebSocket();

    return () => {
      clearMessages();
    };
  }, [conversationId, socket, connectWebSocket, subscribeToConversation, clearMessages]);

  // Process WebSocket messages
  useEffect(() => {
    const relevantMessages = wsMessages.filter(
      msg => msg.payload.conversationId === conversationId
    );

    if (relevantMessages.length === 0) {
      setData({
        status: 'processing',
        progress: 0
      });
      return;
    }

    const result: ConversationResult = {
      status: 'processing',
      progress: 0
    };

    // Process messages in order
    relevantMessages.forEach((msg: WebSocketMessage, index: number) => {
      switch (msg.type) {
        case 'transcript':
          result.transcript = msg.payload.content;
          result.progress = Math.min(50, Math.round((index + 1) / relevantMessages.length * 100));
          break;
        case 'analysis':
          result.analysis = msg.payload.content;
          result.progress = Math.min(100, 50 + Math.round((index + 1) / relevantMessages.length * 50));
          break;
        case 'error':
          result.status = 'error';
          result.error = msg.payload.error;
          result.progress = 100;
          break;
        case 'status':
          if (msg.payload.status === 'completed') {
            result.status = 'completed';
            result.progress = 100;
          }
          break;
      }
    });

    setData(result);
    setIsLoading(false);
  }, [wsMessages, conversationId]);

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
    refetch
  };
}; 