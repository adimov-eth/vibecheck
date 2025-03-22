// RecordingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
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
import { useAudioRecording } from '../../hooks/useAudioRecording';
import { useUpload } from '../../hooks/useUpload';
import { useApi } from '../../hooks/useAPI';
import { useSubscriptionCheck } from '../../hooks/useSubscriptionCheck';
import { router } from 'expo-router';
import { useUsage } from '../../hooks/useUsage';

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
  onNewRecording?: () => void;
  onRecordingComplete: (conversationId: string) => void;
}

export default function RecordingScreen({ selectedMode, onGoBack, onRecordingComplete }: RecordingScreenProps): React.ReactElement {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const [uploadsComplete, setUploadsComplete] = useState<boolean>(false);
  const [processingComplete, setProcessingComplete] = useState<boolean>(false);

  // Context and hooks
  const { setConversationId, clearRecordings, setRecordingData, error, setError } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording, releaseRecordings, hasBeenReleased } = useAudioRecording();
  const { uploadAudio, pollForStatus, isUploading } = useUpload();
  const { createConversation } = useApi();
  useSubscriptionCheck();
  const { checkCanCreateConversation, usageStats } = useUsage();

  // Track cleanup state to prevent multiple release attempts
  const cleanupInitiatedRef = useRef<boolean>(false);

  // Show error toast when error state changes
  useEffect(() => {
    if (error) {
      showToast.error('Error', error);
    }
  }, [error]);

  // Clear recordings data when component mounts
  useEffect(() => {
    clearRecordings();
    return () => {
      // Empty cleanup to satisfy the dependency
    };
  }, [clearRecordings]);

  /**
   * Handle starting/stopping recording based on current state
   */
  const handleToggleRecording = async (): Promise<void> => {
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
          // In live mode, upload the single recording immediately
          console.log(`Uploading single recording for live mode, uri: ${savedUri}`);
          
          const { success } = await uploadAudio(conversationId!, savedUri);
          
          if (success) {
            setUploadsComplete(true);
            setProcessingComplete(true);
            onRecordingComplete(conversationId!);
          } else if (error) {
            showToast.error('Upload Failed', error);
            setIsProcessing(false);
            return;
          }
        }
      } else if (partner1Uri) {
        // Second partner's recording completed
        setProcessingComplete(true);
        onRecordingComplete(conversationId!);
        
        // Continue with the processing in the background
        setPartner2Uri(savedUri);
        setRecordingData({ partner1: partner1Uri, partner2: savedUri });
        
        console.log(`Uploading both recordings for separate mode, partner1: ${partner1Uri}, partner2: ${savedUri}`);
        
        // Upload one at a time to avoid potential race conditions
        const { success: success1 } = await uploadAudio(conversationId!, partner1Uri);
        const { success: success2 } = await uploadAudio(conversationId!, savedUri);
        
        if (success1 && success2) {
          console.log("All uploads complete");
          setUploadsComplete(true);
        } else if (error) {
          showToast.error('Upload Failed', error);
        }
      }
      
      setIsProcessing(false);
    } else {
      // Starting a new recording
      if (currentPartner === 1) {
        // Check usage limits before creating a new conversation
        const canCreate = await checkCanCreateConversation(true);
        if (!canCreate) return;
        
        // Clear any previous errors and recordings
        setError(null);
        clearRecordings();
        
        // Generate a new UUID for the conversation
        const newConversationId = Crypto.randomUUID();
        setConversationIdState(newConversationId);
        setConversationId(newConversationId);
        
        // Start recording immediately
        await startRecording();
        
        // Create conversation in the backend
        createConversation(newConversationId, selectedMode.id, recordMode)
          .then(serverConversationId => {
            if (serverConversationId !== newConversationId) {
              setConversationIdState(serverConversationId);
              setConversationId(serverConversationId);
            }
          })
          .catch(err => {
            console.error('Failed to create conversation:', err);
            setError('Failed to create conversation. Please try again.');
            showToast.error('Error', 'Failed to create conversation, but recording continues.');
          });
      } else {
        // Start recording for partner 2
        await startRecording();
      }
    }
  };

  // Poll for conversation status after uploads complete
  useEffect(() => {
    if (uploadsComplete && conversationId) {
      console.log(`Starting to poll for status of conversation: ${conversationId}`);
      
      const stopPolling = pollForStatus(conversationId, () => {
        console.log('Polling complete, processing complete');
        setProcessingComplete(true);
        
        // Release recordings after processing is complete if not already released
        if (!cleanupInitiatedRef.current && !hasBeenReleased) {
          cleanupInitiatedRef.current = true;
          
          releaseRecordings()
            .then(() => console.log('All recordings released after processing'))
            .catch(err => console.error('Error releasing recordings:', err));
        }
      });
      
      // Return the stop polling function for cleanup
      return stopPolling;
    }
  }, [uploadsComplete, conversationId, pollForStatus, releaseRecordings, hasBeenReleased]);
  
  // Ensure all recordings are released when component unmounts
  useEffect(() => {
    return () => {
      if (!cleanupInitiatedRef.current && !hasBeenReleased) {
        console.log('Releasing recordings on component unmount');
        releaseRecordings()
          .catch(err => console.error('Error releasing recordings on unmount:', err));
      } else {
        console.log('Skipping release on unmount - already released or cleanup initiated');
      }
    };
  }, [releaseRecordings, hasBeenReleased]);

  /**
   * Toggle between separate and live recording modes
   */
  const handleToggleMode = (index: number): void => {
    setRecordMode(index === 0 ? 'separate' : 'live');
  };

  /**
   * Render a processing indicator with a message
   */
  const renderProcessingIndicator = (message: string): React.ReactElement => (
    <View style={styles.processingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.recordingStatus}>{message}</Text>
    </View>
  );

  /**
   * Render the current recording status UI
   */
  const renderRecordingStatus = (): React.ReactElement | null => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }
    
    if (processingComplete) {
      return renderProcessingIndicator('Finalizing results...');
    }
    
    if (isUploading) {
      return renderProcessingIndicator('Uploading...');
    }
    
    if (isProcessing) {
      return renderProcessingIndicator('Processing...');
    }
    
    if (recordingStatus !== '') {
      return <Text style={styles.recordingStatus}>{recordingStatus}</Text>;
    }
    
    return null;
  };

  /**
   * Render the usage indicator UI
   */
  const renderUsageIndicator = (): React.ReactElement | null => {
    if (!usageStats) return null;
    
    const isSubscribed = usageStats.isSubscribed;
    const limitReached = !isSubscribed && usageStats.remainingConversations <= 0;
    
    return (
      <View style={styles.usageIndicator}>
        <Text style={[
          styles.usageText, 
          isSubscribed ? styles.unlimitedText : (limitReached ? styles.limitReachedText : {})
        ]}>
          {isSubscribed ? '∞ Unlimited' : 
           (usageStats.remainingConversations > 0 ? 
             `${usageStats.remainingConversations} conversations left` : 
             'No conversations left')}
        </Text>
        {!isSubscribed && (
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={() => router.push('/paywall' as any)}
          >
            <Text style={styles.upgradeText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  /**
   * Reset state and retry after an error
   */
  const handleRetry = (): void => {
    if (error) {
      // Clear error state
      setError(null);
      
      // Reset UI states
      setIsProcessing(false);
      setUploadsComplete(false);
      setProcessingComplete(false);
      
      // If we have a conversation ID but no uploads, we can retry
      if (conversationId && !uploadsComplete) {
        if (partner1Uri && partner2Uri) {
          // Both partners recorded, retry upload
          uploadAudio(conversationId, [partner1Uri, partner2Uri])
            .then(({ success }) => {
              if (success) setUploadsComplete(true);
            })
            .catch(err => console.error('Retry upload failed:', err));
        } else if (partner1Uri) {
          // Just first partner recorded
          if (recordMode === 'separate') {
            // Ready for partner 2
            setCurrentPartner(2);
          } else {
            // In live mode, retry upload
            uploadAudio(conversationId, partner1Uri)
              .then(({ success }) => {
                if (success) setUploadsComplete(true);
              })
              .catch(err => console.error('Retry upload failed:', err));
          }
        }
      }
    }
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
          {renderUsageIndicator()}
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
                disabled={isProcessing || isUploading || processingComplete}
              />
              <Text style={styles.recordingInstructions}>
                {isRecording 
                  ? 'Recording... Tap to stop' 
                  : isProcessing || isUploading || processingComplete
                    ? 'Processing...'
                    : 'Tap to start recording'}
              </Text>
              {renderRecordingStatus()}
              
              {error && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetry}
                >
                  <Text style={styles.retryText}>Try Again</Text>
                </TouchableOpacity>
              )}
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

// Styles
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
  errorContainer: { 
    marginTop: spacing.md, 
    padding: spacing.sm,
    borderRadius: layout.borderRadius.small,
    backgroundColor: `${colors.error}20`,
    maxWidth: '80%',
  },
  errorText: {
    ...typography.body2,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius.small,
    marginTop: spacing.md,
  },
  retryText: {
    ...typography.body2,
    color: colors.white,
    fontWeight: '600',
  },
  usageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
    borderRadius: layout.borderRadius.medium,
  },
  usageText: {
    ...typography.body2,
    color: colors.mediumText,
  },
  unlimitedText: {
    color: colors.success,
    fontWeight: '600',
  },
  limitReachedText: {
    color: colors.error,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius.small,
  },
  upgradeText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
});