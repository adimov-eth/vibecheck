
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '../styles'; // Assume these are defined
import { useRecording } from '../../contexts/RecordingContext'; // Assume this provides recording state management
import { showToast } from '../../components/Toast';
import * as Crypto from 'expo-crypto';
import { useAudioRecording, AudioRecordingHook } from '../../hooks/useAudioRecording'; // Assume this exists
import { useUpload, UploadHook } from '../../hooks/useUpload';
import { useApi, ApiHook } from '../../hooks/useAPI'; // Updated import pathinterface Mode {
  

interface Mode {
    id: string;
    title: string;
    description: string;
    color: string;
  }
  
  
interface RecordingScreenProps {
  selectedMode: Mode;
  onGoBack: () => void;
  onRecordingComplete: () => void;
  onNewRecording: () => void;
}
export default function RecordingScreen({ selectedMode, onGoBack, onRecordingComplete }: RecordingScreenProps) {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const [uploadsComplete, setUploadsComplete] = useState(false);  const { setConversationId, clearRecordings } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording }: AudioRecordingHook = useAudioRecording();
  const { uploadAudio, pollForStatus, isUploading }: UploadHook = useUpload();
  const { createConversation, getConversationStatus, pollForResult }: ApiHook = useApi();  useEffect(() => {
    clearRecordings();
    return () => setConversationId(null);
  }, [clearRecordings, setConversationId]);  const handleToggleRecording = async () => {
    if (isRecording) {
      const savedUri = await stopRecording(conversationId!, `partner${currentPartner}`);
      if (!savedUri) return;
      setIsProcessing(true);
      if (currentPartner === 1) {
        setPartner1Uri(savedUri);
        if (recordMode === 'separate') {
          setCurrentPartner(2);
        } else {
          const success = await uploadAudio(conversationId!, savedUri);
          if (success) setUploadsComplete(true);
        }
      } else if (partner1Uri) {
        setPartner2Uri(savedUri);
        const success = await uploadAudio(conversationId!, [partner1Uri, savedUri]);
        if (success) setUploadsComplete(true);
      }
      setIsProcessing(false);
    } else {
      if (currentPartner === 1) {
        clearRecordings();
        const newConversationId = Crypto.randomUUID();
        setConversationIdState(newConversationId);
        setConversationId(newConversationId);
        try {
          const serverConversationId = await createConversation(newConversationId, selectedMode.id, recordMode);
          if (serverConversationId !== newConversationId) {
            setConversationIdState(serverConversationId);
            setConversationId(serverConversationId);
          }
        } catch (error) {
          console.error('Failed to create conversation:', error);
          showToast.error('Error', 'Failed to create conversation.');
          return;
        }
      }
      await startRecording();
    }
  };  useEffect(() => {
    if (uploadsComplete && conversationId) {
      const stopPolling = pollForStatus(conversationId, () => {
        setTimeout(onRecordingComplete, 1000);
      });
      return stopPolling;
    }
  }, [uploadsComplete, conversationId, pollForStatus, onRecordingComplete]);  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity onPress={onGoBack}>
          <Text>Back</Text>
        </TouchableOpacity>
        <Text>{selectedMode.title}</Text>
        <View>
          <Text>Recording Mode: {recordMode}</Text>
          <TouchableOpacity onPress={() => setRecordMode(recordMode === 'separate' ? 'live' : 'separate')}>
            <Text>Toggle Mode</Text>
          </TouchableOpacity>
        </View>
        <View>
          <Text>Partner {currentPartner}</Text>
          <TouchableOpacity onPress={handleToggleRecording} disabled={isProcessing || isUploading}>
            <Text>{isRecording ? 'Stop Recording' : 'Start Recording'}</Text>
          </TouchableOpacity>
          {isUploading || isProcessing ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Text>{recordingStatus}</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

