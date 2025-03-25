// /app/(main)/recording/[id].tsx
import { ModeCard } from '@/components/conversation/ModeCard';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { AudioWaveform } from '@/components/recording/AudioWaveform';
import { RecordButton } from '@/components/recording/RecordButton';
import { Toggle } from '@/components/ui/Toggle';
import { colors, spacing, typography } from '@/constants/styles';
import { useRecordingFlow } from '@/hooks';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

export default function Recording() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Mode details (could be fetched from a store or API)
  const [mode, setMode] = useState<Mode>(() => getModeDetails(typeof id === 'string' ? id : ''));

  // Recording flow hook
  const {
    recordMode,
    currentPartner,
    isRecording,
    isUploading,
    handleToggleMode,
    handleToggleRecording,
    error,
    cleanup,
    uploadProgress,
  } = useRecordingFlow({
    modeId: id as string,
    onComplete: useCallback((conversationId) => router.replace(`../results/${conversationId}`), [router]),
  });

  // Load mode details
  const modeDetails = useMemo(() => getModeDetails(id as string), [id]);
  useEffect(() => {
    setMode(modeDetails);
  }, [modeDetails]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  // Render processing/uploading indicator
  const renderProcessingIndicator = () => (
    <View style={styles.processingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.processingText}>
        {isUploading ? 'Uploading...' : 'Processing...'}
      </Text>
      {uploadProgress > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <View
              style={[styles.progressBar, { width: `${uploadProgress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>{uploadProgress}%</Text>
        </View>
      )}
    </View>
  );

  return (
    <Container withSafeArea>
      <AppBar
        title={mode.title}
        showBackButton
        onBackPress={() => router.back()}
      />
      <View style={styles.content}>
        {/* Mode Card */}
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

        {/* Recording Controls */}
        <View style={styles.controlsContainer}>
          <Text style={styles.modeLabelText}>Recording Mode</Text>
          <Toggle
            options={['Separate', 'Live']}
            selectedIndex={recordMode === 'separate' ? 0 : 1}
            onChange={handleToggleMode}
            disabled={isRecording || isUploading}
          />
        </View>

        {/* Partner Indicator for Separate Mode */}
        {recordMode === 'separate' && (
          <View style={styles.partnerContainer}>
            <Text style={styles.partnerText}>Partner {currentPartner}</Text>
            {currentPartner === 2 && (
              <View style={styles.recordedIndicator}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.recordedText}>Partner 1 recorded</Text>
              </View>
            )}
          </View>
        )}

        {/* Recording Button and Status */}
        <View style={styles.recordingContainer}>
          {isUploading ? (
            renderProcessingIndicator()
          ) : (
            <>
              <RecordButton
                isRecording={isRecording}
                onPress={handleToggleRecording}
              />
              <Text style={styles.recordingInstructions}>
                {isRecording ? 'Recording... Tap to stop' : 'Tap to start recording'}
              </Text>
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Waveform Visualization */}
        <View style={styles.waveformContainer}>
          <AudioWaveform isActive={isRecording} />
        </View>
      </View>
    </Container>
  );
}

// Helper function for mode details (replace with store/API in production)
function getModeDetails(id: string): Mode {
  const modes: Record<string, Mode> = {
    mediator: { id: 'mediator', title: 'Mediator', description: 'Get balanced insights', color: '#58BD7D' },
    counselor: { id: 'counselor', title: "Who's Right", description: 'Get a clear verdict', color: '#3B71FE' },
    dinner: { id: 'dinner', title: 'Dinner Planner', description: 'Decide what to eat', color: '#4BC9F0' },
    movie: { id: 'movie', title: 'Movie Night', description: 'Find something to watch', color: '#FF6838' },
  };
  return modes[id] || { id, title: 'Recording', description: 'Record your conversation', color: '#3B71FE' };
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg },
  modeCardContainer: { marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  controlsContainer: { marginBottom: spacing.lg, alignItems: 'center' },
  modeLabelText: { ...typography.body2, marginBottom: spacing.sm },
  partnerContainer: { alignItems: 'center', marginVertical: spacing.lg },
  partnerText: { ...typography.heading2, marginBottom: spacing.sm },
  recordedIndicator: { flexDirection: 'row', alignItems: 'center' },
  recordedText: { ...typography.body2, color: colors.success, marginLeft: spacing.xs },
  recordingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  recordingInstructions: { ...typography.body2, color: colors.mediumText, marginTop: spacing.md },
  errorContainer: { backgroundColor: `${colors.error}20`, borderRadius: 8, padding: spacing.md, marginTop: spacing.md },
  errorText: { ...typography.body2, color: colors.error, textAlign: 'center' },
  waveformContainer: { height: 120, marginVertical: spacing.lg },
  processingContainer: { alignItems: 'center' },
  processingText: { ...typography.body2, color: colors.mediumText, marginTop: spacing.md },
  progressContainer: { width: '80%', marginTop: spacing.md },
  progressBackground: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: colors.primary },
  progressText: { ...typography.caption, textAlign: 'center', marginTop: spacing.xs },
});