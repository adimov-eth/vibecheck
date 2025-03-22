// useUpload.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { showToast } from '../components/Toast'; // Assume this is a toast notification utility
import { addToUploadQueue } from '../utils/backgroundUpload'; // Assume this handles upload queuing
import { useRecording } from '../contexts/RecordingContext';
import { useWebSocketResults } from './useWebSocketResults';

// Define more specific types for better type safety
interface AudioStatus {
  status: 'uploading' | 'transcribing' | 'transcribed' | 'failed';
  error?: string;
}

export interface UploadHook {
  uploadAudio: (conversationId: string, uris: string | string[]) => Promise<{ 
    success: boolean; 
    audioIds: readonly number[] 
  }>;
  isUploading: boolean;
  isPolling: boolean;
  pollForStatus: (conversationId: string, onComplete?: () => void) => () => void;
  audioStatus: Record<number, AudioStatus>;
}

// Type guard for upload result validation
interface UploadResult {
  audioId: number;
}

const isValidUploadResult = (result: unknown): result is UploadResult => {
  return result !== null && 
         typeof result === 'object' && 
         'audioId' in result && 
         typeof (result as any).audioId === 'number';
};

export function useUpload(): UploadHook {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isPolling] = useState<boolean>(false);
  const [, setUploadedAudioIds] = useState<readonly number[]>([]);
  
  // Get access to RecordingContext including setError
  const { conversationId, setError } = useRecording();
  
  // Get WebSocket status updates when we have a conversation ID
  const { audioStatus: rawAudioStatus, isWebSocketConnected } = useWebSocketResults(conversationId);

  // Use constants for configuration
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds
  const POLLING_INTERVAL = 3000; // 3 seconds

  // Track active timers for cleanup
  const activeTimersRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Clean up function for timers
  const cleanupTimers = useCallback((): void => {
    activeTimersRef.current.forEach(timer => clearInterval(timer));
    activeTimersRef.current.clear();
  }, []);

  // Improved upload function with better type handling
  const uploadAudio = useCallback(async (
    conversationId: string,
    uris: string | string[],
    retryCount = 0
  ): Promise<{ success: boolean; audioIds: readonly number[] }> => {
    setIsUploading(true);
    try {
      const files = Array.isArray(uris) ? uris : [uris];
      setError(null);
      const audioIds: number[] = [];

      // Process each file sequentially
      for (const uri of files) {
        console.log(`Starting upload for ${uri} in conversation ${conversationId}`);
        const result = await addToUploadQueue(conversationId, uri);
        
        if (isValidUploadResult(result)) {
          audioIds.push(result.audioId);
          console.log(`Upload successful, audioId: ${result.audioId}`);
        } else {
          const errorMsg = `Upload succeeded but returned unexpected format: ${JSON.stringify(result)}`;
          console.warn(errorMsg);
          setError(errorMsg);
          throw new Error(errorMsg);
        }
      }

      setUploadedAudioIds(prev => [...prev, ...audioIds]);
      setIsUploading(false);
      return { success: true, audioIds: Object.freeze(audioIds) };
    } catch (error: unknown) {
      const typedError = error as Error;
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return uploadAudio(conversationId, uris, retryCount + 1);
      }
      
      const errorMsg = `Upload failed after ${MAX_RETRIES} retries: ${typedError?.message || 'Unknown error'}`;
      console.error(errorMsg);
      showToast.error('Upload Error', 'Failed to upload recording(s) after multiple attempts.');
      setError(errorMsg);
      setIsUploading(false);
      return { success: false, audioIds: [] };
    }
  }, [setError]);

  // Improved polling with better cleanup
  const pollForStatus = useCallback((conversationId: string, onComplete?: () => void) => {
    console.log(`Setting up status polling for conversation: ${conversationId}`);
    
    const checkAudioStatus = (): boolean => {
      const statuses = Object.values(rawAudioStatus);
      if (statuses.length === 0) return false;
      
      const allComplete = statuses.every(status =>
        status.status === 'transcribed' || status.status === 'failed'
      );
      
      if (allComplete) {
        console.log('All audio processing complete via WebSocket or polling');
        if (onComplete) onComplete();
        return true;
      }
      
      return false;
    };

    // Check immediately first
    const isComplete = checkAudioStatus();
    if (isComplete) {
      if (onComplete) onComplete();
      return () => {}; // Empty cleanup function
    }

    // Set up polling if needed
    let timer: NodeJS.Timeout | undefined;
    if (!isWebSocketConnected) {
      console.log('WebSocket not connected, starting polling fallback');
      timer = setInterval(() => {
        if (checkAudioStatus()) {
          if (timer) {
            clearInterval(timer);
            activeTimersRef.current.delete(timer);
          }
        }
      }, POLLING_INTERVAL);
      
      // Track for cleanup
      activeTimersRef.current.add(timer);
    } else {
      console.log('WebSocket connected, relying on real-time updates');
    }

    // Return cleanup function
    return () => {
      if (timer) {
        console.log('Cleaning up polling timer');
        clearInterval(timer);
        activeTimersRef.current.delete(timer);
      }
    };
  }, [rawAudioStatus, isWebSocketConnected]);

  // Process audio status updates
  useEffect(() => {
    if (Object.keys(rawAudioStatus).length > 0) {
      console.log('Audio status updated:', rawAudioStatus);
      
      // Handle failures
      const failedAudios = Object.entries(rawAudioStatus)
        .filter(([_, status]) => status.status === 'failed');
      
      if (failedAudios.length > 0) {
        const [audioId, status] = failedAudios[0];
        const errorMsg = `Audio ${audioId} processing failed: ${status.error || 'Unknown error'}`;
        setError(errorMsg);
        
        // Show toast for each failure
        failedAudios.forEach(([id, status]) => {
          showToast.error('Audio Processing Failed', status.error || 'Unknown error occurred');
          console.error(`Audio ${id} processing failed: ${status.error}`);
        });
      } else {
        // Check for success
        const successfulAudios = Object.entries(rawAudioStatus)
          .filter(([_, status]) => status.status === 'transcribed');
          
        const allSuccessful = successfulAudios.length === Object.keys(rawAudioStatus).length;
        
        if (successfulAudios.length > 0 && allSuccessful) {
          setError(null);
        }
      }
    }
  }, [rawAudioStatus, setError]);

  // Clean up timers on unmount
  useEffect(() => {
    return cleanupTimers;
  }, [cleanupTimers]);

  return {
    uploadAudio,
    isUploading,
    isPolling,
    pollForStatus,
    audioStatus: rawAudioStatus as Record<number, AudioStatus>
  };
}