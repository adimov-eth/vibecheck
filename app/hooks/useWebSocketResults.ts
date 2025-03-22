import { useState, useEffect, useCallback, useRef } from 'react';
import { useRecording } from '../contexts/RecordingContext';
import { useApi, cancelAllPolling } from './useAPI';
import { useWebSocketManager } from '../utils/websocketManager';

export interface UseWebSocketResultsReturn {
  isLoading: boolean;
  error: string | null;
  processingProgress: number;
  refetchResults: () => void;
  isWebSocketConnected: boolean;
  audioStatus: Record<number, { status: string; error?: string }>;
}

/**
 * Hook for fetching and subscribing to real-time conversation results using WebSockets
 * Falls back to polling if WebSocket connection fails
 */
export function useWebSocketResults(conversationId: string | null): UseWebSocketResultsReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usePollingFallback, setUsePollingFallback] = useState(false);
  const [audioStatus, setAudioStatus] = useState<Record<number, { status: string; error?: string }>>({});
  
  // Get methods from the recording context
  const { 
    analysisResult, 
    setAnalysisResult,
    processingProgress,
    setProcessingProgress,
    setConversationId,
    updateAudioStatus
  } = useRecording();
  
  // Get API methods for fallback polling
  const { pollForResult, getConversationStatus, getConversationResult } = useApi();
  
  // Track last error time to avoid error flood
  const lastErrorRef = useRef<number>(0);
  
  // Keep track if we've already fetched results to avoid multiple polls
  const hasInitializedRef = useRef(false);
  
  // Track if we're already polling for this conversation (fallback)
  const isFallbackPollingRef = useRef(false);
  
  // Create the WebSocket subscription topic
  const conversationTopic = conversationId ? `conversation:${conversationId}` : null;
  
  // Initialize WebSocket connection
  const { 
    connectionState, 
    lastMessage, 
    subscribe, 
    unsubscribe, 
    isSubscribed 
  } = useWebSocketManager();
  
  // Check if connected to WebSocket
  const isWebSocketConnected = connectionState === 'connected';

  /**
   * Function to immediately fetch conversation results
   */
  const fetchResultsImmediately = useCallback(async (convId: string) => {
    try {
      console.log(`Fetching results immediately for ${convId}`);
      
      // Fetch the full results
      const result = await getConversationResult(convId);
      
      // Update state
      setAnalysisResult(result);
      setProcessingProgress(100);
      setIsLoading(false);
      
      console.log('Results loaded successfully via direct fetch');
    } catch (err) {
      // Avoid displaying errors too frequently
      const now = Date.now();
      if (now - lastErrorRef.current > 5000) {
        console.error('Error fetching results:', err);
        setError('Failed to load results. Tap to retry.');
        lastErrorRef.current = now;
      }
      setIsLoading(false);
    }
  }, [getConversationResult, setAnalysisResult, setProcessingProgress]);

  /**
   * Handle incoming WebSocket messages
   */
  useEffect(() => {
    if (!lastMessage || !conversationId) return;
    
    // Only process messages related to our conversation if topic is specified
    if (lastMessage.topic && !lastMessage.topic.includes(conversationId)) {
      return;
    }
    
    console.log(`Received WebSocket message: ${lastMessage.type}`, lastMessage.payload);
    
    switch (lastMessage.type) {
      case 'conversation_progress':
        // Update progress
        const progress = lastMessage.payload.progress * 100; // Convert from 0-1 to 0-100
        if (progress > processingProgress) {
          console.log(`Updating progress from WebSocket: ${progress.toFixed(0)}%`);
          setProcessingProgress(progress);
        }
        break;
        
      case 'conversation_completed':
        console.log('Conversation processing complete, fetching results');
        // Fetch the full results when processing is complete
        fetchResultsImmediately(conversationId);
        break;
        
      case 'conversation_error':
      case 'conversation_failed':
        console.error('Error from WebSocket:', lastMessage.payload.error);
        setError(`Processing error: ${lastMessage.payload.error}`);
        setIsLoading(false);
        break;

      case 'audio_processed':
        // Update audio status when transcription is complete
        const { audioId, status } = lastMessage.payload;
        console.log(`Audio ${audioId} processing complete with status: ${status}`);
        
        // Update local state
        setAudioStatus(prev => ({
          ...prev,
          [audioId]: { status }
        }));
        
        // Also update RecordingContext
        updateAudioStatus(audioId, { status: 'transcribed' });
        break;
        
      case 'audio_failed':
        // Handle audio processing failure
        const failedAudioId = lastMessage.payload.audioId;
        const errorMessage = lastMessage.payload.error;
        console.error(`Audio ${failedAudioId} processing failed: ${errorMessage}`);
        
        // Update local state
        setAudioStatus(prev => ({
          ...prev,
          [failedAudioId]: { status: 'failed', error: errorMessage }
        }));
        
        // Also update RecordingContext
        updateAudioStatus(failedAudioId, { 
          status: 'failed', 
          error: errorMessage 
        });
        break;
    }
  }, [lastMessage, conversationId, processingProgress, updateAudioStatus, fetchResultsImmediately, setProcessingProgress]);

  /**
   * Subscribe to conversation updates and verify conversation exists
   */
  useEffect(() => {
    if (!conversationId) {
      setError('No conversation ID provided');
      setIsLoading(false);
      return;
    }

    // Set the conversation ID in the recording context
    setConversationId(conversationId);
    
    // Reset error state
    setError(null);
    
    // Create subscription topic string
    const topic = `conversation:${conversationId}`;
    
    // Check if we're already subscribed
    if (!isSubscribed(topic)) {
      console.log(`Subscribing to conversation updates for ${conversationId}`);
      subscribe(topic);
    }
    
    // Verify conversation exists and get initial status
    const verifyConversation = async () => {
      try {
        // First check if we already have the analysis result
        if (analysisResult) {
          console.log('Analysis result already available, skipping initialization');
          hasInitializedRef.current = true;
          setIsLoading(false);
          return;
        }
        
        // Otherwise verify conversation and get its status
        const status = await getConversationStatus(conversationId);
        
        // Initialize with current status
        if (status.status === 'completed') {
          // Conversation is already complete, fetch results directly
          await fetchResultsImmediately(conversationId);
        } else if (status.status === 'processing') {
          // Conversation is still processing, update progress
          if (status.progress !== undefined) {
            const progress = status.progress * 100; // Convert from 0-1 to 0-100
            setProcessingProgress(Math.max(progress, processingProgress));
          } else {
            // If no progress available, start at 5%
            setProcessingProgress(Math.max(5, processingProgress));
          }
          
          // If WebSocket is not connected, fall back to polling
          if (connectionState !== 'connected') {
            console.log('WebSocket not connected, falling back to polling');
            setUsePollingFallback(true);
          }
        } else {
          // Handle error or other status
          setError(`Conversation has unexpected status: ${status.status}`);
          setIsLoading(false);
        }
        
        // Mark as initialized
        hasInitializedRef.current = true;
      } catch (err) {
        console.error('Error verifying conversation:', err);
        setError('Conversation not found or error occurred');
        setIsLoading(false);
      }
    };

    // Only initialize once per conversation ID
    if (!hasInitializedRef.current) {
      verifyConversation();
    }
    
    // Cleanup: unsubscribe from conversation updates
    return () => {
      if (conversationTopic) {
        console.log(`Unsubscribing from ${conversationTopic}`);
        unsubscribe(conversationTopic);
      }
      
      // Cancel polling if active
      if (isFallbackPollingRef.current) {
        console.log(`Cancelling fallback polling for ${conversationId}`);
        cancelAllPolling(conversationId);
        isFallbackPollingRef.current = false;
      }
    };
  }, [conversationId, setConversationId, getConversationStatus, isSubscribed, subscribe, unsubscribe, connectionState, analysisResult, fetchResultsImmediately, processingProgress, setProcessingProgress, conversationTopic]);

  /**
   * Fall back to polling if WebSocket is disconnected
   */
  useEffect(() => {
    // Don't start polling if we don't have a conversation ID or already have results
    if (!conversationId || !isLoading || error || analysisResult || !usePollingFallback) {
      return;
    }
    
    // Don't start polling if we're already polling for this conversation
    if (isFallbackPollingRef.current) {
      return;
    }
    
    console.log(`Starting fallback polling for ${conversationId}`);
    isFallbackPollingRef.current = true;
    
    // Start polling with progress updates
    pollForResult(conversationId, (progress: number) => {
      if (progress > processingProgress) {
        setProcessingProgress(progress);
      }
    })
      .then((result) => {
        console.log('Results loaded successfully via polling');
        setAnalysisResult(result);
        setIsLoading(false);
        isFallbackPollingRef.current = false;
      })
      .catch((err: Error) => {
        // Don't show errors for cancelled polls
        if (err.message === 'Polling was cancelled') {
          console.log('Polling was cancelled, ignoring error');
          return;
        }
        
        console.error('Error fetching results via polling:', err);
        setError('Failed to load results. Tap to retry.');
        setIsLoading(false);
        isFallbackPollingRef.current = false;
      });
      
    // Cleanup function
    return () => {
      if (isFallbackPollingRef.current) {
        console.log(`Cleaning up fallback polling for ${conversationId}`);
        cancelAllPolling(conversationId);
        isFallbackPollingRef.current = false;
      }
    };
  }, [
    conversationId,
    isLoading,
    error,
    analysisResult,
    usePollingFallback,
    processingProgress,
    pollForResult,
    setAnalysisResult,
    setProcessingProgress
  ]);

  /**
   * Function to reset state and retry fetching results
   */
  const refetchResults = useCallback(() => {
    if (!conversationId) return;
    
    // Clear previous error
    setError(null);
    
    // Reset loading state
    setIsLoading(true);
    
    // Reset polling flags
    hasInitializedRef.current = false;
    
    // Cancel any ongoing polling
    if (isFallbackPollingRef.current) {
      cancelAllPolling(conversationId);
      isFallbackPollingRef.current = false;
    }
    
    // Try WebSocket first, with fallback to polling
    if (connectionState === 'connected') {
      // If WebSocket is connected, subscribe to updates
      const topic = `conversation:${conversationId}`;
      if (!isSubscribed(topic)) {
        console.log(`Resubscribing to ${topic}`);
        subscribe(topic);
      }
      setUsePollingFallback(false);
    } else {
      // Otherwise use polling fallback
      console.log('WebSocket not connected, using polling fallback for retry');
      setUsePollingFallback(true);
    }
  }, [
    conversationId, 
    connectionState, 
    isSubscribed, 
    subscribe
  ]);

  return {
    isLoading,
    error,
    processingProgress,
    refetchResults,
    isWebSocketConnected,
    audioStatus
  };
}