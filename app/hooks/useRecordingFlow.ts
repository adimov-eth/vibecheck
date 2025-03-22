import { useState, useEffect, useCallback } from 'react';
import { useRecording } from '../contexts/RecordingContext';
import { useAudioRecording } from './useAudioRecording';
import { UploadService } from '../services/UploadService';
import { useApi } from './useAPI';
import * as Crypto from 'expo-crypto';

export function useRecordingFlow(selectedModeId: string, onRecordingComplete: (conversationId: string) => void) {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState<boolean>(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isReadyToUpload, setIsReadyToUpload] = useState<boolean>(false);
  const [uploadsComplete, setUploadsComplete] = useState<boolean>(false);
  const [processingComplete, setProcessingComplete] = useState<boolean>(false);

  const { setConversationId, clearRecordings } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording, releaseRecordings } = useAudioRecording();
  const { createConversation } = useApi();
  const uploadService = new UploadService();

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      const savedUri = await stopRecording(conversationId!, `partner${currentPartner}`);
      if (!savedUri) return;
      
      setIsProcessing(true);
      
      if (recordMode === 'live') {
        setAudioUri(savedUri);
        setIsReadyToUpload(true);
      } else {
        if (currentPartner === 1) {
          setPartner1Uri(savedUri);
          setCurrentPartner(2);
        } else {
          setPartner2Uri(savedUri);
          setIsReadyToUpload(true);
        }
      }
      setIsProcessing(false);
    } else {
      if (recordMode === 'separate' && currentPartner === 1 || recordMode === 'live') {
        const newConversationId = Crypto.randomUUID();
        setConversationIdState(newConversationId);
        setConversationId(newConversationId);
        setIsCreatingConversation(true);
        createConversation(newConversationId, selectedModeId, recordMode)
          .then(serverConvId => {
            if (serverConvId !== newConversationId) {
              setConversationIdState(serverConvId);
              setConversationId(serverConvId);
            }
            setIsCreatingConversation(false);
          })
          .catch(err => {
            setConversationError(err.message);
            setIsCreatingConversation(false);
          });
      }
      await startRecording();
    }
  }, [isRecording, recordMode, currentPartner, conversationId, stopRecording, startRecording, createConversation, selectedModeId, setConversationId]);

  useEffect(() => {
    if (isReadyToUpload && conversationId && !isCreatingConversation && !conversationError) {
      const uris = recordMode === 'live' ? audioUri : [partner1Uri, partner2Uri].filter(Boolean) as string[];
      if (!uris) return;
      uploadService.uploadAudio(conversationId, uris)
        .then(() => {
          setUploadsComplete(true);
          setIsReadyToUpload(false);
          setProcessingComplete(true);
          onRecordingComplete(conversationId);
        })
        .catch(error => {
          console.error('Error uploading audio:', error);
          setIsReadyToUpload(false);
          setConversationError(error.message);
        });
    }
  }, [isReadyToUpload, conversationId, isCreatingConversation, conversationError, recordMode, audioUri, partner1Uri, partner2Uri, uploadService, onRecordingComplete]);

  return {
    recordMode,
    currentPartner,
    isProcessing,
    conversationId,
    partner1Uri,
    partner2Uri,
    audioUri,
    isCreatingConversation,
    conversationError,
    isReadyToUpload,
    uploadsComplete,
    processingComplete,
    handleToggleRecording,
    handleToggleMode: (index: number) => setRecordMode(index === 0 ? 'separate' : 'live'),
    cleanup: async () => {
      await releaseRecordings();
    },
    recordingStatus,
    isRecording,
    isUploading: isReadyToUpload && !uploadsComplete,
  };
}