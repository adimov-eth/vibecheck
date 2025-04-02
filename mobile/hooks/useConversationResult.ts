import { useEffect, useRef, useState } from 'react';
import useStore from '../state/index';
import type { AnalysisMessage, AudioMessage, ErrorMessage, StatusMessage, TranscriptMessage, WebSocketMessage } from '../state/types';

interface ConversationResult {
  transcript?: string;
  analysis?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
  progress: number;
}

interface ConversationPayload {
  id: string;
}

interface BaseMessagePayload {
  conversationId?: string;
  conversation?: ConversationPayload;
}

export const useConversationResult = (conversationId: string) => {
  const [data, setData] = useState<ConversationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Move all refs to the top level
  const isSubscribed = useRef(false);
  const lastAttemptTime = useRef(0);
  const mounted = useRef(true);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

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
    mounted.current = true;

    // Attempt to subscribe and return success status
    const attemptSubscription = () => {
      if (!mounted.current) return false;
      
      // Only log in development
      if (__DEV__) {
        console.log('Attempting to subscribe to conversation:', conversationId);
      }
      
      try {
        subscribeToConversation(conversationId);
        isSubscribed.current = true;
        lastAttemptTime.current = Date.now();
        return true;
      } catch (error) {
        console.error('Error subscribing to conversation:', error);
        return false;
      }
    };

    // Set up a periodic health check to ensure subscription is active
    const startConnectionHealthCheck = () => {
      // Clear any existing interval
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
      
      // Check connection every 15 seconds
      checkInterval.current = setInterval(() => {
        if (!mounted.current) return;
        
        const now = Date.now();
        const timeSinceLastAttempt = now - lastAttemptTime.current;
        
        // If socket is closed and we haven't attempted in the last 10 seconds
        if ((!socket || socket.readyState !== WebSocket.OPEN) && timeSinceLastAttempt > 10000) {
          if (__DEV__) {
            console.log('Health check: WebSocket connection needs refresh');
          }
          connectWebSocket();
          lastAttemptTime.current = now;
        }
        
        // If we've been connected for at least 5 seconds but haven't received messages
        // for this conversation, try re-subscribing
        if (socket?.readyState === WebSocket.OPEN && timeSinceLastAttempt > 5000) {
          const hasRelevantMessages = wsMessages.some(msg => {
            const payload = msg.payload as BaseMessagePayload;
            if (!payload) return false;
            
            return payload.conversationId === conversationId || 
                   (payload.conversation?.id === conversationId);
          });
          
          if (!hasRelevantMessages && isSubscribed.current) {
            if (__DEV__) {
              console.log('Health check: No messages received, re-subscribing');
            }
            subscribeToConversation(conversationId);
            lastAttemptTime.current = now;
          }
        }
      }, 15000);
    };

    // Initialize the connection and subscription
    const initialize = async () => {
      try {
        if (__DEV__) {
          console.log('Initializing WebSocket for conversation:', conversationId);
        }
        
        // Always attempt to subscribe, which will connect if needed
        attemptSubscription();
        
        // Start health check to ensure connection remains active
        startConnectionHealthCheck();
      } catch (err) {
        console.error('WebSocket initialization error:', err);
        if (mounted.current) {
          setError(err instanceof Error ? err : new Error('Failed to connect to WebSocket'));
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      if (__DEV__) {
        console.log('Cleaning up WebSocket for conversation:', conversationId);
      }
      mounted.current = false;
      isSubscribed.current = false;
      
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
      
      unsubscribeFromConversation(conversationId);
    };
  }, [conversationId, socket, connectWebSocket, subscribeToConversation, unsubscribeFromConversation]);

  useEffect(() => {
    if (!mounted.current) return;
    
    // Only log in development mode
    if (__DEV__) {
      console.log('Processing messages for conversation:', conversationId);
      console.log('wsMessages:', wsMessages);
    }
    
    try {
      // Filter messages for this conversation, but be more flexible with conversationId location
      const relevantMessages = wsMessages.filter(
        (msg) => {
          try {
            // Handle different message types according to their specific structure
            if (msg.type === 'transcript' || msg.type === 'analysis' || msg.type === 'status') {
              return msg.payload.conversationId === conversationId;
            } else if (msg.type === 'audio') {
              return msg.payload.conversationId === conversationId;
            } else if (msg.type === 'error') {
              // Include error messages that might be related to this conversation
              return !msg.payload.conversationId || msg.payload.conversationId === conversationId;
            }
            
            // Filter out connection, subscription and pong messages
            return false;
          } catch (e) {
            console.error('Error filtering message:', e);
            return false;
          }
        }
      );
    
      if (__DEV__) {
        console.log(`Found ${relevantMessages.length} relevant messages for conversation ${conversationId}`);
      }

      if (relevantMessages.length === 0) {
        if (mounted.current) {
          setData({
            status: 'processing',
            progress: 0,
          });
          setIsLoading(true);
        }
        return;
      }

    const result: ConversationResult = {
      status: 'processing',
      progress: 0,
    };

    relevantMessages.forEach((msg: WebSocketMessage) => {
      if (__DEV__) {
        console.log('Processing message:', msg.type);
      }
      
      // Process each message type based on the specific payload structure
      switch (msg.type) {
        case 'transcript':
          // Transcript messages contain the raw transcription
          const transcriptMsg = msg as TranscriptMessage;
          result.transcript = transcriptMsg.payload.content;
          result.progress = 50;
          break;
          
        case 'analysis':
          // Analysis messages contain the GPT analysis
          const analysisMsg = msg as AnalysisMessage;
          result.analysis = analysisMsg.payload.content;
          result.progress = 100;
          break;
          
        case 'error':
          // Error messages indicate something went wrong
          const errorMsg = msg as ErrorMessage;
          result.status = 'error';
          result.error = errorMsg.payload.error;
          result.progress = 100;
          clearUploadState(conversationId);
          break;
          
        case 'status':
          // Status messages indicate conversation state changes
          const statusMsg = msg as StatusMessage;
          
          if (statusMsg.payload.status === 'conversation_completed' || 
              statusMsg.payload.status === 'completed') {
            // Conversation is fully processed
            result.status = 'completed';
            
            // Use gptResponse from the status message if available
            if (statusMsg.payload.gptResponse) {
              result.analysis = statusMsg.payload.gptResponse;
            }
            
            result.progress = 100;
            clearUploadState(conversationId);
          } else if (statusMsg.payload.status === 'error') {
            // Status can also indicate an error
            result.status = 'error';
            result.error = statusMsg.payload.error || 'Unknown error occurred';
            result.progress = 100;
            clearUploadState(conversationId);
          }
          break;
          
        case 'audio':
          // Audio processing status updates
          const audioMsg = msg as AudioMessage;
          if (audioMsg.payload.status === 'transcribed') {
            // Audio transcription complete - update progress
            result.progress = Math.max(result.progress, 40);
          } else if (audioMsg.payload.status === 'failed') {
            // Audio processing failed
            result.status = 'error';
            result.error = 'Audio processing failed';
            result.progress = 100;
            clearUploadState(conversationId);
          }
          break;
      }
    });

      if (mounted.current) {
        setData(result);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error processing WebSocket messages:', err);
      if (mounted.current) {
        setError(err instanceof Error ? err : new Error('Error processing messages'));
        setIsLoading(false);
      }
    }
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