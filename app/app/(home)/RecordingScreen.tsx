// RecordingScreen.tsx
import React, { useState, useEffect } from 'react';
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
import { 
  useApi, 
  AnalysisResponse 
} from '../../utils/apiService'; // Import AnalysisResponse
import { useRecording } from '../../contexts/RecordingContext';
import { showToast } from '../../components/Toast';

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

// Define the API interface type to match what useApi returns
interface ApiMethods {
  createConversation: (mode: string, recordingType: "separate" | "live") => Promise<string>;
  uploadAudio: (conversationId: string, audioUri: string) => Promise<void>;
  processFirstRecording: (audioUri: string, mode: string) => Promise<any>;
  processSeparateRecordings: (partner1Uri: string, partner2Uri: string, updateProgress: (progress: number) => void, mode: string) => Promise<any>;
  processLiveRecording: (audioUri: string, updateProgress: (progress: number) => void, mode: string) => Promise<any>;
  getConversationStatus: (conversationId: string) => Promise<any>;
  parseGptResponse: (gptResponse: string) => AnalysisResponse;
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
  const [recordingStatus, setRecordingStatus] = useState<string>('');
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  
  const { setRecordingData, clearRecordings, setConversationId } = useRecording();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);

  // Call hook at component top level
  const api = useApi();
  
  console.log('TOKEN STATUS:', api.Token ? 'Available' : 'Missing');
  
  useEffect(() => {
    clearRecordings();
    (async () => {
      await requestPermissions();
    })();
    return () => {
      if (recording) recording.stopAndUnloadAsync();
      setConversationId(null);
    };
  }, [clearRecordings, setConversationId]);

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
        showToast.error(
          'Permission Required',
          'Audio recording permission is required to use this feature.'
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      showToast.error(
        'Permission Error',
        'Failed to request audio recording permissions.'
      );
    }
  };

  const startRecording = async () => {
    try {
      if (!isPermissionGranted) {
        await requestPermissions();
      }

      if (isProcessing) return;

      clearRecordings();
      
      // Start recording immediately (optimistically)
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

      setRecordingStatus('Starting recording...');
      // Start recording immediately
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      setRecording(recording);
      setIsRecording(true);
      setRecordingStatus('Recording in progress...');
      
      // Create conversation in parallel (if needed)
      if (!conversationId) {
        try {
          if (!api.Token) {
            console.error("Cannot create conversation: Authentication token not available");
            Alert.alert('Authentication Error', 'Please wait for authentication to complete or try logging in again.');
            // Don't stop recording - we'll handle this during stopRecording
          } else {
            // Create conversation in the background
            const createConversationPromise = api.createConversation(selectedMode.id, recordMode);
            createConversationPromise.then(convId => {
              setConversationIdState(convId);
              setConversationId(convId);
            }).catch(error => {
              console.error('Failed to create conversation:', error);
              // Don't stop recording - we'll handle this during stopRecording
            });
          }
        } catch (error) {
          console.error('Failed to create conversation:', error);
          // Don't stop recording - we'll handle this during stopRecording
        }
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      showToast.error(
        'Recording Error',
        'Failed to start recording. Please try again.'
      );
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setRecordingStatus('Stopping recording...');
      await recording.stopAndUnloadAsync();
      const tempUri = recording.getURI();
      
      if (!tempUri) throw new Error('Recording URI is undefined');

      setIsProcessing(true);
      setRecordingStatus('Processing recording...');
      
      // If conversation creation failed, try again before proceeding
      if (!conversationId) {
        try {
          if (!api.Token) {
            console.error("Cannot create conversation: Authentication token not available");
            Alert.alert('Authentication Error', 'Please wait for authentication to complete or try logging in again.');
            throw new Error('Authentication token not available');
          }
          const convId = await api.createConversation(selectedMode.id, recordMode);
          setConversationIdState(convId);
          setConversationId(convId);
        } catch (error) {
          console.error('Failed to create conversation:', error);
          throw new Error('Network error: Failed to create conversation');
        }
      }
      
      const partnerPrefix = currentPartner === 1 ? 'partner1' : 'partner2';
      let savedUri;
      try {
        setRecordingStatus('Saving recording locally...');
        savedUri = await saveAudioRecording(tempUri, partnerPrefix);
      } catch (error) {
        console.error('Failed to save audio recording:', error);
        throw new Error('Failed to save recording');
      }
      
      // Verify token before upload
      if (!api.Token) {
        console.error('Cannot upload: Authentication token not available');
        Alert.alert('Authentication Error', 'Please wait for authentication to complete or try logging in again.');
        throw new Error('Authentication token not available');
      }

      setRecordingStatus('Uploading to server...');
      if (api) {
        try {
          console.log(`Uploading audio for conversation: ${conversationId}`);
          await api.uploadAudio(conversationId!, savedUri);
          setRecordingStatus('Upload complete. Processing audio...');
        } catch (error) {
          console.error('Failed to upload audio:', error);
          throw new Error('Network error: Failed to upload recording');
        }
      }

      if (currentPartner === 1) {
        setPartner1Uri(savedUri);
        if (recordMode === 'separate') {
          setRecordingStatus('First recording processed! Ready for partner 2.');
          setCurrentPartner(2);
        } else {
          setRecordingData({ partner1: savedUri });
          setRecordingStatus('Recording processed successfully!');
          setTimeout(() => onRecordingComplete(), 1000);
        }
      } else {
        setPartner2Uri(savedUri);
        if (partner1Uri) {
          setRecordingStatus('Both recordings processed successfully!');
          setRecordingData({ partner1: partner1Uri, partner2: savedUri });
          setTimeout(() => onRecordingComplete(), 1000);
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to process recording';
      if (errorMessage.includes('Network error')) {
        showToast.networkError(
          'Connection Error',
          'Failed to upload your recording. Please check your connection and try again.'
        );
      } else {
        showToast.error(
          'Processing Error',
          'Failed to process recording. Please try again.'
        );
      }
    }
  };

  const handleToggleMode = (index: number) => {
    setRecordMode(index === 0 ? 'separate' : 'live');
  };

  const toggleRecording = async () => {
    if (!isRecording) await startRecording();
    else await stopRecording();
  };

  const renderRecordingStatus = () => {
    if (isProcessing) {
      return (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.recordingStatus}>{recordingStatus}</Text>
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
                    <Text style={styles.recordedText}>Partner 1 recording processed</Text>
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
});