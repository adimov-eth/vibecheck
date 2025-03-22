// useUpload.ts
import { useState, useCallback, useEffect } from 'react';
import { showToast } from '../components/Toast'; // Assume this is a toast notification utility
import { addToUploadQueue } from '../utils/backgroundUpload'; // Assume this handles upload queuing
import { useRecording } from '../contexts/RecordingContext';
import { useWebSocketResults } from './useWebSocketResults';


export interface UploadHook {
  uploadAudio: (conversationId: string, uris: string | string[]) => Promise<{ success: boolean; audioIds: number[] }>;
  isUploading: boolean;
  isPolling: boolean;
  pollForStatus: (conversationId: string, onComplete?: () => void) => () => void;
  audioStatus: Record<number, { status: string; error?: string }>;
}

export function useUpload(): UploadHook {
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling] = useState(false);
  const [, setUploadedAudioIds] = useState<number[]>([]);
  
  // Track ongoing polling operations to prevent duplicates
  const { conversationId } = useRecording();
  
  // Get WebSocket status updates when we have a conversation ID
  const { audioStatus, isWebSocketConnected } = useWebSocketResults(conversationId);

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds

  const uploadAudio = useCallback(async (conversationId: string, uris: string | string[], retryCount = 0): Promise<{ success: boolean; audioIds: number[] }> => {
    setIsUploading(true);
    try {
      const files = Array.isArray(uris) ? uris : [uris];
      
      // Since we don't know the exact return type of addToUploadQueue, we'll use a safer approach
      const audioIds: number[] = [];
      
      // Process each upload sequentially to better handle potential errors
      for (const uri of files) {
        try {
          // Use type assertion to handle unknown return type
          const result = await addToUploadQueue(conversationId, uri) as unknown;
          
          // Check if result has the expected structure
          if (
            result !== null && 
            typeof result === 'object' && 
            'audioId' in result && 
            typeof result.audioId === 'number'
          ) {
            audioIds.push(result.audioId);
          } else {
            console.warn('Upload succeeded but returned unexpected format:', result);
          }
        } catch (uploadError) {
          console.error('Error uploading file:', uri, uploadError);
        }
      }
      
      setUploadedAudioIds(prev => [...prev, ...audioIds]);
      setIsUploading(false);
      
      return { 
        success: audioIds.length > 0, 
        audioIds 
      };
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.log(`Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return uploadAudio(conversationId, uris, retryCount + 1);
      }
      console.error('Upload error after retries:', error);
      showToast.error('Upload Error', 'Failed to upload recording(s) after multiple attempts.');
      setIsUploading(false);
      return { success: false, audioIds: [] };
    }
  }, []);

  // Implementation of pollForStatus that watches audioStatus for completion
  // This is a simplified polling mechanism that relies on WebSockets when available
  const pollForStatus = useCallback((conversationId: string, onComplete?: () => void) => {
    console.log(`Setting up status polling for conversation: ${conversationId}`);
    
    // Check if all audio files are processed
    const checkAudioStatus = () => {
      // Get all audio statuses for this conversation
      const statuses = Object.values(audioStatus);
      
      if (statuses.length === 0) {
        return false; // No audio files yet
      }
      
      const allComplete = statuses.every(status => 
        status.status === 'transcribed' || status.status === 'failed'
      );
      
      if (allComplete) {
        console.log('All audio processing complete');
        if (onComplete) onComplete();
        return true;
      }
      
      return false;
    };
    
    // Do an initial check
    const isComplete = checkAudioStatus();
    if (isComplete) {
      if (onComplete) onComplete();
      return () => {}; // Return empty cleanup function
    }
    
    // Set up a timer to check periodically if WebSockets are not connected
    let timer: NodeJS.Timeout | undefined = undefined;
    
    if (!isWebSocketConnected) {
      timer = setInterval(() => {
        if (checkAudioStatus()) {
          if (timer) clearInterval(timer);
        }
      }, 3000);
    }
    
    // Return cleanup function
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [audioStatus, isWebSocketConnected]);

  // Log audio status changes for debugging
  useEffect(() => {
    if (Object.keys(audioStatus).length > 0) {
      console.log('Audio status updated:', audioStatus);
      
      // Check for failed audio uploads
      const failedAudios = Object.entries(audioStatus).filter(([_, status]) => status.status === 'failed');
      if (failedAudios.length > 0) {
        failedAudios.forEach(([audioId, status]) => {
          showToast.error('Audio Processing Failed', status.error || 'Unknown error occurred');
          console.error(`Audio ${audioId} processing failed: ${status.error}`);
        });
      }
    }
  }, [audioStatus]);

  return { 
    uploadAudio, 
    isUploading, 
    isPolling,
    pollForStatus,
    audioStatus 
  };
}