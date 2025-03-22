import { useState, useEffect, useRef, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
import { useRecording } from '../contexts/RecordingContext';
import { useAudioRecording } from './useAudioRecording';
import { useUpload } from './useUpload';
import { useApi } from './useAPI';
import { showToast } from '../components/Toast';
import { useUsage } from './useUsage';

interface RecordingFlowState {
  recordMode: 'separate' | 'live';
  currentPartner: 1 | 2;
  isProcessing: boolean;
  conversationId: string | null;
  partner1Uri: string | null;
  partner2Uri: string | null;
  audioUri: string | null; // For live mode
  isCreatingConversation: boolean;
  conversationError: string | null;
  isReadyToUpload: boolean;
  uploadsComplete: boolean;
  processingComplete: boolean;
}

interface RecordingFlowResult extends RecordingFlowState {
  handleToggleRecording: () => Promise<void>;
  handleToggleMode: (index: number) => void;
  cleanup: () => Promise<void>;
  recordingStatus: string;
  isRecording: boolean;
  isUploading: boolean;
}

export function useRecordingFlow(selectedModeId: string, onRecordingComplete: (conversationId: string) => void): RecordingFlowResult {
  // State management
  const [state, setState] = useState<RecordingFlowState>({
    recordMode: 'separate',
    currentPartner: 1,
    isProcessing: false,
    conversationId: null,
    partner1Uri: null,
    partner2Uri: null,
    audioUri: null,
    isCreatingConversation: false,
    conversationError: null,
    isReadyToUpload: false,
    uploadsComplete: false,
    processingComplete: false
  });

  // Context and hooks
  const { setConversationId, clearRecordings } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording, releaseRecordings, hasBeenReleased } = useAudioRecording();
  const { uploadAudio, pollForStatus, isUploading } = useUpload();
  const { createConversation } = useApi();
  const { checkCanCreateConversation } = useUsage();

  // Ref to prevent duplicate cleanup
  const cleanupInitiatedRef = useRef(false);

  // Update state helper
  const updateState = useCallback((updates: Partial<RecordingFlowState>) => {
    setState(prevState => ({ ...prevState, ...updates }));
  }, []);

  // Initial cleanup on mount
  useEffect(() => {
    clearRecordings();
    // Cleanup handled in separate effect
  }, [clearRecordings]);

  // Handle recording toggle
  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stopping recording
      const { conversationId, currentPartner, recordMode } = state;
      if (!conversationId) {
        showToast.error('Error', 'Conversation ID is missing');
        return;
      }

      updateState({ isProcessing: true });
      
      const savedUri = await stopRecording(conversationId, `partner${currentPartner}`);
      if (!savedUri) {
        updateState({ isProcessing: false });
        return;
      }

      if (recordMode === 'live') {
        updateState({ 
          audioUri: savedUri,
          isReadyToUpload: true,
          isProcessing: false
        });
      } else if (recordMode === 'separate') {
        if (currentPartner === 1) {
          updateState({ 
            partner1Uri: savedUri,
            currentPartner: 2,
            isProcessing: false
          });
        } else {
          updateState({ 
            partner2Uri: savedUri,
            isReadyToUpload: true,
            isProcessing: false
          });
        }
      }
    } else {
      // Starting recording
      const { recordMode, currentPartner } = state;
      
      if ((recordMode === 'separate' && currentPartner === 1) || recordMode === 'live') {
        const canCreate = await checkCanCreateConversation(true);
        if (!canCreate) return;
        
        clearRecordings();
        const newConversationId = Crypto.randomUUID();
        
        updateState({ 
          conversationId: newConversationId,
          isCreatingConversation: true,
          conversationError: null
        });
        
        setConversationId(newConversationId);
        
        createConversation(newConversationId, selectedModeId, recordMode)
          .then(serverConvId => {
            if (serverConvId !== newConversationId) {
              updateState({ conversationId: serverConvId });
              setConversationId(serverConvId);
            }
            updateState({ isCreatingConversation: false });
          })
          .catch(err => {
            updateState({ 
              conversationError: err.message,
              isCreatingConversation: false
            });
            showToast.error('Conversation Error', 'Failed to create conversation, but recording will continue');
          });
      }
      
      await startRecording();
    }
  }, [
    isRecording, 
    state, 
    updateState, 
    stopRecording, 
    checkCanCreateConversation, 
    clearRecordings, 
    setConversationId, 
    createConversation, 
    selectedModeId, 
    startRecording
  ]);

  // Handle toggle recording mode
  const handleToggleMode = useCallback((index: number) => {
    updateState({ recordMode: index === 0 ? 'separate' : 'live' });
  }, [updateState]);

  // Handle upload when ready
  useEffect(() => {
    const { 
      isReadyToUpload, 
      conversationId, 
      isCreatingConversation, 
      conversationError, 
      recordMode, 
      audioUri, 
      partner1Uri, 
      partner2Uri 
    } = state;
    
    if (isReadyToUpload && conversationId && !isCreatingConversation && !conversationError) {
      if (recordMode === 'live' && audioUri) {
        uploadAudio(conversationId, audioUri)
          .then(() => {
            updateState({ 
              uploadsComplete: true,
              isReadyToUpload: false
            });
          })
          .catch(error => {
            showToast.error('Upload Error', 'Failed to upload recordings. Please try again.');
            console.error('Error uploading audio:', error);
            updateState({ isReadyToUpload: false });
          });
      } else if (recordMode === 'separate' && partner1Uri && partner2Uri) {
        uploadAudio(conversationId, [partner1Uri, partner2Uri])
          .then(() => {
            updateState({ 
              uploadsComplete: true,
              isReadyToUpload: false
            });
          })
          .catch(error => {
            showToast.error('Upload Error', 'Failed to upload recordings. Please try again.');
            console.error('Error uploading audio:', error);
            updateState({ isReadyToUpload: false });
          });
      }
    } else if (isReadyToUpload && conversationError) {
      showToast.error('Conversation Error', `Error creating conversation: ${conversationError}`);
      updateState({ isReadyToUpload: false });
    }
  }, [state, uploadAudio, updateState]);

  // Cleanup function
  const performCleanup = useCallback(async (convId: string) => {
    try {
      await releaseRecordings();
      console.log('All recordings released after processing');
      onRecordingComplete(convId);
    } catch (err) {
      console.error('Error releasing recordings:', err);
      onRecordingComplete(convId); // Proceed anyway
    }
  }, [releaseRecordings, onRecordingComplete]);

  // Poll for status after uploads are complete
  useEffect(() => {
    const { uploadsComplete, conversationId } = state;
    
    if (uploadsComplete && conversationId) {
      console.log(`Starting to poll for status of conversation: ${conversationId}`);
      
      const stopPolling = pollForStatus(conversationId, () => {
        updateState({ processingComplete: true });
        
        if (!cleanupInitiatedRef.current && !hasBeenReleased) {
          cleanupInitiatedRef.current = true;
          
          setTimeout(() => {
            performCleanup(conversationId);
          }, 500);
        } else {
          onRecordingComplete(conversationId);
        }
      });
      
      return stopPolling;
    }
  }, [state.uploadsComplete, state.conversationId, pollForStatus, onRecordingComplete, hasBeenReleased, updateState, state, performCleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!cleanupInitiatedRef.current && !hasBeenReleased) {
        console.log('Releasing recordings on component unmount');
        releaseRecordings().catch(err => {
          console.error('Error releasing recordings on unmount:', err);
        });
      }
    };
  }, [releaseRecordings, hasBeenReleased]);

  // Public cleanup method
  const cleanup = useCallback(async () => {
    if (!cleanupInitiatedRef.current && !hasBeenReleased) {
      cleanupInitiatedRef.current = true;
      await releaseRecordings();
    }
  }, [releaseRecordings, hasBeenReleased]);

  return {
    ...state,
    handleToggleRecording,
    handleToggleMode,
    cleanup,
    recordingStatus,
    isRecording,
    isUploading
  };
} 