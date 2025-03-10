// useUpload.ts
import { useState, useCallback, useRef } from 'react';
import { useApi } from '../hooks/useAPI'; // Updated import path
import { showToast } from '../components/Toast'; // Assume this is a toast notification utility
import { addToUploadQueue } from '../utils/backgroundUpload'; // Assume this handles upload queuing

export interface UploadHook {
    uploadAudio: (conversationId: string, uris: string | string[]) => Promise<boolean>;
    pollForStatus: (conversationId: string, onComplete: () => void) => () => void;
    isUploading: boolean;
    isPolling: boolean;
  }

export function useUpload(): UploadHook {
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const api = useApi();

  const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

const uploadAudio = useCallback(async (conversationId: string, uris: string | string[], retryCount = 0): Promise<boolean> => {
  setIsUploading(true);
  try {
    const files = Array.isArray(uris) ? uris : [uris];
    await Promise.all(files.map(uri => addToUploadQueue(conversationId, uri)));
    setIsUploading(false);
    return true;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`Upload failed, retrying (${retryCount + 1}/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return uploadAudio(conversationId, uris, retryCount + 1);
    }
    console.error('Upload error after retries:', error);
    showToast.error('Upload Error', 'Failed to upload recording(s) after multiple attempts.');
    setIsUploading(false);
    return false;
  }
}, []);

const pollForStatus = useCallback((conversationId: string, onComplete: () => void) => {
    setIsPolling(true);
    let retryCount = 0;
    const interval = setInterval(async () => {
      try {
        const { status } = await api.getConversationStatus(conversationId);
        retryCount = 0; // Reset retries on success
        if (status === 'completed') {
          clearInterval(interval);
          setIsPolling(false);
          onComplete();
        }
      } catch (error) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`Polling failed, retry ${retryCount}/${MAX_RETRIES}`);
          showToast.error('Polling Issue', `Retrying (${retryCount}/${MAX_RETRIES})...`);
        } else {
          console.error('Polling error after retries:', error);
          showToast.error('Polling Error', 'Failed to check conversation status after multiple attempts.');
          clearInterval(interval);
          setIsPolling(false);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [api]);

  return { uploadAudio, pollForStatus, isUploading, isPolling };
}