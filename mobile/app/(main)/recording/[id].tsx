import { ModeCard } from '@/components/conversation/ModeCard';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { AudioWaveform } from '@/components/recording/AudioWaveform';
import { RecordButton } from '@/components/recording/RecordButton';
import { Toggle } from '@/components/ui/Toggle';
import { colors, spacing, typography } from '@/constants/styles';
import { useRecordingFlow } from '@/hooks/useRecordingFlow';
import { useUsageStore } from '@/hooks/useTypedStore';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Define the Mode interface
interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

export default function Recording() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { checkCanCreateConversation } = useUsageStore();
  
  // State to track the local mode data (normally this would come from a store or API)
  const [mode, setMode] = useState<Mode>({
    id: typeof id === 'string' ? id : '',
    title: 'Recording',
    description: 'Record your conversation',
    color: '#3B71FE',
  });

  // Initialize our recording flow hook with a completion callback
  const recordingFlow = useRecordingFlow(id as string, (conversationId) => {
    // Navigate to results when recording is complete
    router.replace(`/results/${conversationId}`);
  });

  const {
    recordMode,
    currentPartner,
    isRecording,
    handleToggleRecording,
    handleToggleMode,
    isUploading,
    isProcessing,
    processingProgress,
    error,
    conversationId,
    isWebSocketConnected,
    partner1Uri,
    cleanup
  } = recordingFlow;

  // Load the appropriate mode details based on ID (in a real app this might come from an API or store)
  useEffect(() => {
    if (id) {
      // This is a simplified example - in a real app, you would fetch this from an API or store
      const modeDetails = getModeDetails(id as string);
      setMode(modeDetails);
    }
  }, [id]);

  // Perform cleanup when component unmounts
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Validate ability to create a conversation when component mounts
  useEffect(() => {
    const checkUsage = async () => {
      const canCreate = await checkCanCreateConversation(true);
      if (!canCreate) {
        // If they can't create a conversation, go back
        router.back();
      }
    };
    
    checkUsage();
  }, [checkCanCreateConversation, router]);

  const renderProcessingIndicator = () => {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.processingText}>
          {isUploading ? 'Uploading...' : 'Processing...'}
        </Text>
        {processingProgress > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBackground}>
              <View 
                style={[
                  styles.progressBar, 
                  { width: `${processingProgress}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{processingProgress}%</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Container withSafeArea>
      <AppBar
        title={mode.title}
        showBackButton
        onBackPress={() => router.back()}
      />
      
      <View style={styles.content}>
        {/* Mode card and details */}
        <View style={styles.modeCardContainer}>
          <ModeCard
            id={mode.id}
            mode={mode.id}
            title={mode.title}
            description={mode.description}
            color={mode.color}
            onPress={() => {}}
          />
        </View>
        
        <View style={styles.divider} />
        
        {/* Recording controls */}
        <View style={styles.controlsContainer}>
          <View style={styles.toggleContainer}>
            <View style={styles.modeLabel}>
              <Text style={styles.modeLabelText}>Recording Mode</Text>
              <TouchableOpacity 
                style={styles.infoIcon}
                accessibilityLabel="Recording mode information"
              >
                <Text style={styles.infoIconText}>i</Text>
              </TouchableOpacity>
            </View>
            <Toggle
              options={['Separate', 'Live']}
              selectedIndex={recordMode === 'separate' ? 0 : 1}
              onChange={(index) => handleToggleMode(index)}
              disabled={isRecording || isUploading || isProcessing}
            />
          </View>
        </View>
        
        {/* Partner indicator for separate mode */}
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
        
        {/* Recording button and status */}
        <View style={styles.recordingContainer}>
          {isProcessing || isUploading ? (
            renderProcessingIndicator()
          ) : (
            <>
              <RecordButton 
                isRecording={isRecording}
                onPress={handleToggleRecording}
                disabled={isProcessing || isUploading}
              />
              
              <Text style={styles.recordingInstructions}>
                {isRecording 
                  ? 'Recording... Tap to stop' 
                  : 'Tap to start recording'}
              </Text>
              
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </>
          )}
        </View>
        
        {/* Waveform visualization */}
        <View style={styles.waveformContainer}>
          <AudioWaveform isActive={isRecording} />
        </View>
        
        {/* Connection status indicator */}
        {conversationId && (
          <View style={styles.connectionContainer}>
            <View style={[
              styles.connectionIndicator, 
              { backgroundColor: isWebSocketConnected ? colors.success : colors.error }
            ]} />
            <Text style={styles.connectionText}>
              {isWebSocketConnected 
                ? 'Live updates enabled' 
                : 'Using polling for updates'}
            </Text>
          </View>
        )}
      </View>
    </Container>
  );
}

// Helper function to get mode details based on ID
function getModeDetails(id: string): Mode {
  const modes: Record<string, Mode> = {
    mediator: {
      id: 'mediator',
      title: 'Mediator',
      description: 'Get balanced insights',
      color: '#58BD7D',
    },
    counselor: {
      id: 'counselor',
      title: "Who's Right",
      description: 'Get a clear verdict',
      color: '#3B71FE',
    },
    dinner: {
      id: 'dinner',
      title: 'Dinner Planner',
      description: 'Decide what to eat',
      color: '#4BC9F0',
    },
    movie: {
      id: 'movie',
      title: 'Movie Night',
      description: 'Find something to watch',
      color: '#FF6838',
    },
  };
  
  return modes[id] || {
    id,
    title: 'Recording',
    description: 'Record your conversation',
    color: '#3B71FE',
  };
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  modeCardContainer: {
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  controlsContainer: {
    marginBottom: spacing.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeLabelText: {
    ...typography.body2,
    marginRight: spacing.xs,
  },
  infoIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mediumText,
  },
  partnerContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  partnerText: {
    ...typography.heading2,
    marginBottom: spacing.sm,
  },
  recordedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordedText: {
    ...typography.body2,
    color: colors.success,
    marginLeft: spacing.xs,
  },
  recordingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingInstructions: {
    ...typography.body2,
    color: colors.mediumText,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: `${colors.error}20`,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.md,
    maxWidth: '90%',
  },
  errorText: {
    ...typography.body2,
    color: colors.error,
    textAlign: 'center',
  },
  waveformContainer: {
    height: 120,
    marginVertical: spacing.lg,
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    ...typography.body2,
    color: colors.mediumText,
    marginTop: spacing.md,
  },
  progressContainer: {
    width: '80%',
    marginTop: spacing.md,
  },
  progressBackground: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  connectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  connectionText: {
    ...typography.caption,
    color: colors.mediumText,
  },
});