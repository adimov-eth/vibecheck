import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '../styles';
import ModeCard from '../../components/ModeCard';
import AppBar from '../../components/AppBar';
import Toggle from '../../components/Toggle';
import AudioRecordButton from '../../components/AudioRecordButton';
import AudioWaveform from '../../components/AudioWaveform';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { saveAudioRecording } from '../../utils/audioStorage';
import { useApi } from '../../utils/apiService';
import { useRecording } from '../../contexts/RecordingContext';
import { showToast } from '../../components/Toast';
import { addToUploadQueue } from '../../utils/backgroundUpload';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';

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
  onRecordingComplete: () => void;
}

export default function RecordingScreen({ 
  selectedMode, 
  onGoBack,
  onRecordingComplete,
}: RecordingScreenProps) {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string>('');
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const { setRecordingData, clearRecordings, setConversationId } = useRecording();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const api = useApi();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    clearRecordings();
    (async () => {
      await requestPermissions();
    })();
    return () => {
      if (recording) recording.stopAndUnloadAsync();
      setConversationId(null);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      const permissionGranted = status === 'granted';
      setIsPermissionGranted(permissionGranted);
      if (permissionGranted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } else {
        showToast.error('Permission Required', 'Audio recording permission is required.');
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      showToast.error('Permission Error', 'Failed to request audio permissions.');
    }
  };

  const startRecording = async () => {
    try {
      if (!isPermissionGranted) {
        await requestPermissions();
      }
  
      if (isProcessing) return;
      
      // Only clear recordings and generate new ID if NOT recording the second partner
      if (currentPartner === 1) {
        clearRecordings();
      
        // Generate a new conversation ID only for new sessions, not for partner 2
        const newConversationId = Crypto.randomUUID();
        setConversationIdState(newConversationId);
        setConversationId(newConversationId);
      
        // Create conversation on the server using our client-generated ID
        setRecordingStatus('Creating conversation...');
        
        try {
          const serverConversationId = await api.createConversation(
            newConversationId, 
            selectedMode.id, 
            recordMode
          );
          
          // The server should return the same ID we sent, but just in case
          // it doesn't, we'll update our state with what the server returns
          if (serverConversationId !== newConversationId) {
            console.warn('Server returned different conversation ID than what was sent');
            setConversationIdState(serverConversationId);
            setConversationId(serverConversationId);
          }
        } catch (error) {
          console.error('Failed to create conversation:', error);
          showToast.error('Error', 'Failed to create conversation. Please try again.');
          return;
        }
      } else {
        // For partner 2, just show recording status without creating a new conversation
        setRecordingStatus(`Recording partner ${currentPartner}...`);
      }
  
      setRecordingStatus(`Starting recording for partner ${currentPartner}...`);
      const recordingOptions = {
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.APPLELOSSLESS,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };
  
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      setRecording(recording);
      setIsRecording(true);
      setRecordingStatus('Recording in progress...');
    } catch (error) {
      console.error('Failed to start recording:', error);
      showToast.error('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const pollForStatus = async (conversationId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getConversationStatus(conversationId);
        if (status.status === 'completed') {
          clearInterval(interval);
          setRecordingStatus('Processing complete!');
          setTimeout(() => onRecordingComplete(), 1000);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = interval;
  };

  const [uploadsComplete, setUploadsComplete] = useState(false);

const stopRecording = async () => {
  if (!recording) return;

  try {
    setRecordingStatus('Stopping recording...');
    await recording.stopAndUnloadAsync();
    const tempUri = recording.getURI();

    if (!tempUri) throw new Error('Recording URI is undefined');
    if (!conversationId) throw new Error('No conversation ID available');

    setIsProcessing(true);
    setRecordingStatus('Processing recording...');

    const partnerPrefix = currentPartner === 1 ? 'partner1' : 'partner2';
    const savedUri = await saveAudioRecording(tempUri, conversationId, partnerPrefix);

    if (currentPartner === 1) {
      setPartner1Uri(savedUri);
      if (recordMode === 'separate') {
        setRecordingStatus('First recording saved! Ready for partner 2.');
        setCurrentPartner(2);
      } else {
        setRecordingData({ partner1: savedUri });
        setRecordingStatus('Recording saved successfully!');
        setIsUploading(true);
        try {
          await addToUploadQueue(conversationId, savedUri);
          setUploadsComplete(true); // Trigger polling after upload
        } catch (error) {
          console.error('Error uploading audio:', error);
          showToast.error('Upload Error', 'Failed to upload recording.');
        }
      }
    } else {
      setPartner2Uri(savedUri);
      if (partner1Uri) {
        setRecordingStatus('Both recordings saved successfully!');
        setRecordingData({ partner1: partner1Uri, partner2: savedUri });
        setIsUploading(true);
        try {
          // Verify the metadata for partner1 to ensure we're using the same conversation ID
          let partner1ConversationId = conversationId;
          try {
            const metadataUri = `${partner1Uri}.metadata.json`;
            const metadataExists = await FileSystem.getInfoAsync(metadataUri);
            if (metadataExists.exists) {
              const metadata = JSON.parse(await FileSystem.readAsStringAsync(metadataUri));
              if (metadata && metadata.conversationId) {
                // Use the ID from partner 1's metadata
                partner1ConversationId = metadata.conversationId;
                if (partner1ConversationId !== conversationId) {
                  console.warn(`Correcting conversation ID for partner 2 upload from ${conversationId} to ${partner1ConversationId}`);
                  // Update our state with the correct ID
                  setConversationIdState(partner1ConversationId);
                  setConversationId(partner1ConversationId);
                }
              }
            }
          } catch (metadataError) {
            console.error('Error reading partner 1 metadata:', metadataError);
            // Continue with the current conversation ID
          }
          
          // Upload both recordings with the same conversation ID
          await addToUploadQueue(partner1ConversationId, partner1Uri);
          await addToUploadQueue(partner1ConversationId, savedUri);
          setUploadsComplete(true);
        } catch (error) {
          console.error('Error uploading audio:', error);
          showToast.error('Upload Error', 'Failed to upload recordings.');
        }
      }
    }

    setRecording(null);
    setIsRecording(false);
    setIsProcessing(false);
  } catch (error) {
    console.error('Failed to stop recording:', error);
    setIsProcessing(false);
    setIsRecording(false);
    setRecordingStatus('');
    showToast.error('Processing Error', 'Failed to process recording. Please try again.');
  }
};

// Trigger polling when uploads are complete
useEffect(() => {
  if (uploadsComplete && conversationId) {
    pollForStatus(conversationId);
  }
}, [uploadsComplete, conversationId]);

  const handleToggleMode = (index: number) => {
    setRecordMode(index === 0 ? 'separate' : 'live');
  };

  const toggleRecording = async () => {
    if (!isRecording) await startRecording();
    else await stopRecording();
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
                onPress={toggleRecording}
                size={Math.min(90, width * 0.22)}
                disabled={isProcessing}
              />
              <Text style={styles.recordingInstructions}>
                {isRecording 
                  ? 'Recording... Tap to stop' 
                  : isProcessing 
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

// Styles remain unchanged
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