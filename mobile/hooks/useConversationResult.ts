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
    const maxRetries = 5;

    const attemptSubscription = () => {
      console.log('Attempting to subscribe to conversation:', conversationId, 'WebSocket state:', socket?.readyState);
      if (socket?.readyState === WebSocket.OPEN && mounted) {
        console.log('Subscribing to conversation:', conversationId);
        subscribeToConversation(conversationId);
        return true;
      }
      return false;
    };

    const setupWebSocket = async () => {
      try {
        console.log('Setting up WebSocket for conversation:', conversationId);
        
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
          console.log('WebSocket not connected, connecting now...');
          await connectWebSocket();
          
          // Wait a moment after connection before subscribing
          setTimeout(() => {
            if (mounted) {
              attemptSubscription();
            }
          }, 500);
        } else {
          // Initial subscription attempt
          attemptSubscription();
        }

        // Set up retry mechanism for subscription
        const retrySubscription = () => {
          if (!mounted || retryCount >= maxRetries) return;
          
          // Only retry if not already subscribed
          if (!attemptSubscription()) {
            const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000);
            retryCount++;
            
            console.log(`Retry ${retryCount}/${maxRetries} for conversation ${conversationId} in ${retryDelay}ms`);
            
            setTimeout(() => {
              retrySubscription();
            }, retryDelay);
          }
        };

        // Start retry sequence after a short delay
        setTimeout(retrySubscription, 1000);
        
      } catch (err) {
        console.error('WebSocket subscription error:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to connect to WebSocket'));
          setIsLoading(false);
        }
      }
    };

    setupWebSocket();

    return () => {
      console.log('Unsubscribing from conversation:', conversationId);
      mounted = false;
      unsubscribeFromConversation(conversationId);
    };
  }, [conversationId, socket, connectWebSocket, subscribeToConversation, unsubscribeFromConversation]);

  useEffect(() => {
    // Log all WebSocket messages for debugging
    console.log('All WebSocket messages:', wsMessages);
    
    // Filter messages for this conversation, but be more flexible with conversationId location
    const relevantMessages = wsMessages.filter(
      (msg) => (msg.payload.conversationId === conversationId) || 
               (msg.payload.conversation && msg.payload.conversation.id === conversationId)
    );

    console.log('Relevant messages for conversation:', conversationId, relevantMessages);

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
      console.log('Processing message:', msg);
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
          // More flexible handling of status messages
          if (msg.payload.status === 'conversation_completed' || msg.payload.status === 'completed') {
            result.status = 'completed';
            
            // Check different possible locations for the gptResponse
            if (msg.payload.gptResponse) {
              result.analysis = msg.payload.gptResponse;
            } else if (msg.payload.conversation && msg.payload.conversation.gptResponse) {
              result.analysis = msg.payload.conversation.gptResponse;
            } else if (msg.payload.content) {
              result.analysis = msg.payload.content;
            }
            
            result.progress = 100;
            clearUploadState(conversationId);
          } else if (msg.payload.status === 'error') {
            result.status = 'error';
            result.error = msg.payload.error;
            result.progress = 100;
            clearUploadState(conversationId);
          }
          break;
        case 'audio':
          // Handle audio notifications
          if (msg.payload.status === 'transcribed') {
            result.progress = Math.max(result.progress, 40);
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