// RecordingScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, layout } from '../styles';
import ModeCard from '../../components/ModeCard';
import AppBar from '../../components/AppBar';
import Toggle from '../../components/Toggle';
import AudioRecordButton from '../../components/AudioRecordButton';
import AudioWaveform from '../../components/AudioWaveform';
import { Ionicons } from '@expo/vector-icons';
import { useRecording } from '../../contexts/RecordingContext';
import { showToast } from '../../components/Toast';
import * as Crypto from 'expo-crypto';
import { useAudioRecording, AudioRecordingHook } from '../../hooks/useAudioRecording';
import { useUpload, UploadHook } from '../../hooks/useUpload';
import { useApi, ApiHook } from '../../hooks/useAPI';

const { width, height } = Dimensions.get('window');

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface RecordingScreenProps {
  selectedMode: Mode;
  onGoBack: () => void;
  onNewRecording: () => void;
  onRecordingComplete: () => void;
}

export default function RecordingScreen({ selectedMode, onGoBack, onRecordingComplete }: RecordingScreenProps) {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const [uploadsComplete, setUploadsComplete] = useState(false);

  const { setConversationId, clearRecordings, setRecordingData } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording }: AudioRecordingHook = useAudioRecording();
  const { uploadAudio, pollForStatus, isUploading }: UploadHook = useUpload();
  const { createConversation, getConversationStatus, pollForResult }: ApiHook = useApi();

  useEffect(() => {
    clearRecordings();
    return () => setConversationId(null);
  }, [clearRecordings, setConversationId]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      const savedUri = await stopRecording(conversationId!, `partner${currentPartner}`);
      if (!savedUri) return;
      setIsProcessing(true);
      if (currentPartner === 1) {
        setPartner1Uri(savedUri);
        setRecordingData({ partner1: savedUri });
        if (recordMode === 'separate') {
          setCurrentPartner(2);
        } else {
          const success = await uploadAudio(conversationId!, savedUri);
          if (success) setUploadsComplete(true);
        }
      } else if (partner1Uri) {
        setPartner2Uri(savedUri);
        setRecordingData({ partner1: partner1Uri, partner2: savedUri });
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
  };

  useEffect(() => {
    if (uploadsComplete && conversationId) {
      const stopPolling = pollForStatus(conversationId, () => {
        setTimeout(onRecordingComplete, 1000);
      });
      return stopPolling;
    }
  }, [uploadsComplete, conversationId, pollForStatus, onRecordingComplete]);

  const handleToggleMode = (index: number) => {
    setRecordMode(index === 0 ? 'separate' : 'live');
  };

  const renderRecordingStatus = () => {
    if (isUploading) {
      return (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.recordingStatus}>Uploading...</Text>
        </View>
      );
    }
    if (isProcessing) {
      return (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.recordingStatus}>Processing...</Text>
        </View>
      );
    }
    if (recordingStatus !== '') {
      return <Text style={styles.recordingStatus}>{recordingStatus}</Text>;
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AppBar
          showBackButton={true}
          onBackPress={onGoBack}
          title={selectedMode.title}
          showAvatar={false}
        />
        <View style={styles.content}>
          <View style={styles.selectedModeCard}>
            <ModeCard
              mode={selectedMode.id}
              title={selectedMode.title}
              description={selectedMode.description}
              color={selectedMode.color}
              isActive
              onPress={() => {}}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.controlsContainer}>
            <View style={styles.toggleContainer}>
              <View style={styles.modeLabel}>
                <Text style={styles.modeLabelText}>Recording Mode</Text>
                <TouchableOpacity 
                  style={styles.infoIcon}
                  accessibilityLabel="Recording mode information"
                  accessibilityRole="button"
                >
                  <Text style={styles.infoIconText}>i</Text>
                </TouchableOpacity>
              </View>
              <Toggle
                options={['Separate', 'Live']}
                selectedIndex={recordMode === 'separate' ? 0 : 1}
                onToggle={handleToggleMode}
              />
            </View>
          </View>
          <View style={styles.recordingArea}>
            {recordMode === 'separate' && (
              <View style={styles.partnerContainer}>
                <Text style={styles.partnerText}>Partner {currentPartner}</Text>
                {currentPartner === 2 && partner1Uri && (
                  <View style={styles.recordedIndicator}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.recordedText}>Partner 1 recording saved</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.recordButtonContainer}>
              <AudioRecordButton
                isRecording={isRecording}
                onPress={handleToggleRecording}
                size={Math.min(90, width * 0.22)}
                disabled={isProcessing || isUploading}
              />
              <Text style={styles.recordingInstructions}>
                {isRecording 
                  ? 'Recording... Tap to stop' 
                  : isProcessing || isUploading
                    ? 'Processing...'
                    : 'Tap to start recording'}
              </Text>
              {renderRecordingStatus()}
            </View>
            <View style={styles.waveformContainer}>
              <AudioWaveform isActive={isRecording} />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Restore the styles
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: width * 0.05, paddingBottom: spacing.md },
  selectedModeCard: { width: '100%', marginTop: spacing.xl, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md, width: '100%' },
  controlsContainer: { width: '100%', marginBottom: spacing.lg },
  toggleContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  modeLabel: { flexDirection: 'row', alignItems: 'center' },
  modeLabelText: { ...typography.body2, color: colors.darkText, marginRight: spacing.xs },
  infoIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  infoIconText: { fontSize: 12, fontWeight: '600', color: colors.mediumText },
  recordingArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.xxl },
  partnerContainer: { alignItems: 'center', width: '100%', paddingTop: spacing.lg },
  partnerText: { ...typography.heading2, color: colors.darkText, marginBottom: spacing.sm, textAlign: 'center' },
  recordButtonContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  recordingInstructions: { marginTop: spacing.lg, ...typography.body2, color: colors.mediumText, textAlign: 'center' },
  recordedIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  recordedText: { color: colors.success, ...typography.body2, fontWeight: '500', marginLeft: spacing.xs },
  waveformContainer: { width: '100%', height: height * 0.15, marginBottom: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  recordingStatus: { marginTop: spacing.sm, ...typography.caption, color: colors.mediumText, textAlign: 'center' },
  processingContainer: { marginTop: spacing.md, alignItems: 'center', justifyContent: 'center' },
  startOverButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: spacing.md,
    marginTop: spacing.md,
  },
  startOverText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});