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
import { useAudioRecording, AudioRecordingHook } from '../../hooks/useAudioRecording';
import { useUpload, UploadHook } from '../../hooks/useUpload';
import { useApi, ApiHook } from '../../hooks/useAPI';
import { useSubscriptionCheck } from '../../hooks/useSubscriptionCheck';
import { router } from 'expo-router';
import { useUsage } from '../../contexts/UsageContext';

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

export default function RecordingScreen({ selectedMode, onGoBack, onRecordingComplete }: RecordingScreenProps) {
  const [recordMode, setRecordMode] = useState<'separate' | 'live'>('separate');
  const [currentPartner, setCurrentPartner] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [partner1Uri, setPartner1Uri] = useState<string | null>(null);
  const [partner2Uri, setPartner2Uri] = useState<string | null>(null);
  const [uploadsComplete, setUploadsComplete] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);

  const { setConversationId, clearRecordings, setRecordingData } = useRecording();
  const { isRecording, recordingStatus, startRecording, stopRecording, releaseRecordings, hasBeenReleased }: AudioRecordingHook = useAudioRecording();
  const { uploadAudio, pollForStatus, isUploading }: UploadHook = useUpload();
  const { createConversation, getConversationStatus, pollForResult }: ApiHook = useApi();
  const { canAccessPremiumFeature } = useSubscriptionCheck();
  const { checkCanCreateConversation, usageStats, remainingConversationsText } = useUsage();

  // Track whether the cleanup process has already been initiated
  const cleanupInitiatedRef = useRef(false);

  useEffect(() => {
    // Only clear the recordings data, but keep the conversation ID for screen transitions
    clearRecordings();
    
    // Only clear the conversation ID when unmounting if we're not transitioning to results
    return () => {
      // We'll handle conversation ID clearing explicitly in other places
    };
  }, [clearRecordings]);

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
          // In live mode, upload the single recording immediately
          console.log(`Uploading single recording for live mode, uri: ${savedUri}`);
          const success = await uploadAudio(conversationId!, savedUri);
          if (success) {
            setUploadsComplete(true);
            // For live mode, navigate to processing screen after successful upload
            setProcessingComplete(true);
            onRecordingComplete(conversationId!);
          }
        }
      } else if (partner1Uri) {
        // Immediately navigate to the processing screen
        setProcessingComplete(true);
        // Schedule navigation soon after
        onRecordingComplete(conversationId!);
        
        // Then continue with the processing in the background
        setPartner2Uri(savedUri);
        // In separate mode with both recordings completed
        setRecordingData({ partner1: partner1Uri, partner2: savedUri });
        console.log(`Uploading both recordings for separate mode, partner1: ${partner1Uri}, partner2: ${savedUri}`);
        
        // Upload one at a time to avoid potential race conditions
        const success1 = await uploadAudio(conversationId!, partner1Uri);
        const success2 = await uploadAudio(conversationId!, savedUri);
        
        if (success1 && success2) {
          console.log("All uploads complete");
          setUploadsComplete(true);
        }
      }
      setIsProcessing(false);
    } else {
      if (currentPartner === 1) {
        // Check usage limits before creating a new conversation
        const canCreate = await checkCanCreateConversation(true);
        if (!canCreate) {
          // User has reached limit and alert was shown
          return;
        }
        
        clearRecordings();
        const newConversationId = Crypto.randomUUID();
        setConversationIdState(newConversationId);
        setConversationId(newConversationId);
        
        // Start recording immediately
        await startRecording();
        
        // Create conversation in the background
        createConversation(newConversationId, selectedMode.id, recordMode)
          .then(serverConversationId => {
            if (serverConversationId !== newConversationId) {
              setConversationIdState(serverConversationId);
              setConversationId(serverConversationId);
            }
          })
          .catch(error => {
            console.error('Failed to create conversation:', error);
            showToast.error('Error', 'Failed to create conversation, but recording continues.');
            // We don't stop recording here as we want the UX to be seamless
          });
      } else {
        await startRecording();
      }
    }
  };

  useEffect(() => {
    if (uploadsComplete && conversationId) {
      console.log(`Starting to poll for status of conversation: ${conversationId}`);
      const stopPolling = pollForStatus(conversationId, () => {
        // When polling is complete, this callback is invoked
        console.log('Polling complete, processing complete');
        setProcessingComplete(true);
        
        // Clean up recordings only after processing is complete
        // Only initiate cleanup if not already done
        if (!cleanupInitiatedRef.current && !hasBeenReleased) {
          cleanupInitiatedRef.current = true;
          
          setTimeout(() => {
            releaseRecordings()
              .then(() => {
                console.log('All recordings released after processing');
                
                // Navigate to results screen only after cleanup
                console.log('Navigating to results screen');
                onRecordingComplete(conversationId!);
              })
              .catch(err => {
                console.error('Error releasing recordings:', err);
                // Still continue to results even on cleanup error
                console.log('Error during cleanup, still navigating to results');
                onRecordingComplete(conversationId!);
              });
          }, 500); // Small delay before cleanup
        } else if (cleanupInitiatedRef.current || hasBeenReleased) {
          // If already cleaned up, just navigate
          console.log('Cleanup already initiated or recordings released, navigating to results');
          onRecordingComplete(conversationId!);
        }
      });
      
      // Return the stop polling function for cleanup
      return stopPolling;
    }
  }, [uploadsComplete, conversationId, pollForStatus, onRecordingComplete, releaseRecordings, hasBeenReleased]);
  
  // Ensure all recordings are released when component unmounts
  // but only if not already handled by the processing completion
  useEffect(() => {
    return () => {
      // Only release if not already initiated by the completion handler
      // and not already released
      if (!cleanupInitiatedRef.current && !hasBeenReleased) {
        console.log('Releasing recordings on component unmount');
        releaseRecordings().catch(err => {
          console.error('Error releasing recordings on unmount:', err);
        });
      } else {
        console.log('Skipping release on unmount - already released or cleanup initiated');
      }
    };
  }, [releaseRecordings, hasBeenReleased]);

  const handleToggleMode = (index: number) => {
    setRecordMode(index === 0 ? 'separate' : 'live');
  };

  const renderRecordingStatus = () => {
    if (processingComplete) {
      return (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.recordingStatus}>Finalizing results...</Text>
        </View>
      );
    }
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

  // Example function to handle a premium feature
  const handlePremiumFeature = async () => {
    // Check if user can access premium feature
    const canAccess = await canAccessPremiumFeature(true, () => {
      // This callback will be called if user wants to subscribe
      router.push("/paywall" as any);
    });
    
    if (canAccess) {
      // User has subscription, allow premium feature
      console.log('User has subscription, allow premium feature');
      // Implement premium feature here
    }
  };

  const renderUsageIndicator = () => {
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