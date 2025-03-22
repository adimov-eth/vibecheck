import { useState, useEffect, useRef, useCallback } from 'react';
import { useRecording } from '../contexts/RecordingContext';
import { useApi, cancelAllPolling } from './useAPI';

export interface UseResultsReturn {
  isLoading: boolean;
  error: string | null;
  processingProgress: number;
  refetchResults: () => void;
}

export function useResults(conversationId: string | null): UseResultsReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const { 
    analysisResult, 
    setAnalysisResult,
    processingProgress,
    setProcessingProgress,
    setConversationId
  } = useRecording();
  const { pollForResult, getConversationStatus } = useApi();

  // Keep track if we've already fetched results to avoid multiple polls
  const hasPolledRef = useRef(false);
  
  // Track if we've started a poll for this specific conversation
  const hasStartedPollingRef = useRef<string | null>(null);

  // Function to reset state and retry fetching results
  const refetchResults = useCallback(() => {
    if (!conversationId) return;
    
    // Clean up any existing polling first
    if (hasStartedPollingRef.current) {
      cancelAllPolling(hasStartedPollingRef.current);
      hasStartedPollingRef.current = null;
    }
    
    // Clear previous error
    setError(null);
    
    // Reset loading state
    setIsLoading(true);
    
    // Reset polling flags
    hasPolledRef.current = false;
    
    // Increment retry counter to trigger re-fetch
    setRetryCounter(prev => prev + 1);
  }, [conversationId]);

  // Verify conversation exists
  useEffect(() => {
    if (!conversationId) {
      setError('No conversation ID provided');
      setIsLoading(false);
      return;
    }

    setConversationId(conversationId);
    
    const verifyConversation = async () => {
      try {
        await getConversationStatus(conversationId);
        // If we reach here, the conversation exists
      } catch (err) {
        console.error('Error verifying conversation:', err);
        setError('Conversation not found or error occurred');
        setIsLoading(false);
      }
    };

    verifyConversation();
  }, [conversationId, setConversationId, getConversationStatus, retryCounter]);

  // Fetch results
  useEffect(() => {
    // Don't fetch if we don't have an ID or have an error
    if (!conversationId || error) {
      return;
    }
    
    // Don't fetch again if we've already got results for this conversation
    if (analysisResult && !hasPolledRef.current) {
      hasPolledRef.current = true;
      setIsLoading(false);
      return;
    }
    
    // Check if we've already started polling for this specific conversation
    if (hasStartedPollingRef.current === conversationId) {
      return;
    }
    
    // Add a small delay before starting to fetch results
    const timer = setTimeout(() => {
      console.log(`Loading results for conversation ${conversationId}`);
      
      // Mark that we've started polling for this conversation
      hasStartedPollingRef.current = conversationId;
      
      // Don't reset progress to 5% if it's already higher - keep the highest progress value
      if (processingProgress < 5) {
        setProcessingProgress(5);
      }
      
      // Start polling with progress updates
      pollForResult(conversationId, (progress: number) => {
        if (progress > processingProgress) {
          setProcessingProgress(progress);
        }
      })
        .then((result) => {
          console.log('Results loaded successfully:', result);
          hasPolledRef.current = true;
          setAnalysisResult(result);
          setIsLoading(false);
          // Clear the polling tracker
          hasStartedPollingRef.current = null;
        })
        .catch((err: Error) => {
          // Don't show errors for cancelled polls
          if (err.message === 'Polling was cancelled') {
            console.log('Polling was cancelled, ignoring error');
            return;
          }
          
          if (err.message === 'Polling already in progress for this conversation') {
            console.log('Polling already in progress, using existing poll');
            return;
          }
          
          console.error('Error fetching results:', err);
          setError('Failed to load results. Tap to retry.');
          setIsLoading(false);
          // Clear the polling tracker on error too
          hasStartedPollingRef.current = null;
        });
    }, 500);
    
    // Cleanup function that runs when component unmounts or conversationId changes
    return () => {
      clearTimeout(timer);
      
      // Cancel any ongoing polling when the component unmounts or conversation changes
      if (hasStartedPollingRef.current) {
        console.log(`Cleaning up polling for conversation: ${hasStartedPollingRef.current}`);
        cancelAllPolling(hasStartedPollingRef.current);
        hasStartedPollingRef.current = null;
      }
    };
  }, [
    conversationId, 
    analysisResult, 
    error,
    processingProgress,
    retryCounter,
    setAnalysisResult, 
    setProcessingProgress,
    pollForResult
  ]);

  // Ensure polling is cancelled when component unmounts
  useEffect(() => {
    return () => {
      if (hasStartedPollingRef.current) {
        console.log(`Unmounting, cleaning up polling for: ${hasStartedPollingRef.current}`);
        cancelAllPolling(hasStartedPollingRef.current);
        hasStartedPollingRef.current = null;
      }
    };
  }, []);

  return {
    isLoading,
    error,
    processingProgress,
    refetchResults
  };
} 