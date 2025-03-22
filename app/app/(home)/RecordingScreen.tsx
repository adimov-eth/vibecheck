import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { colors, spacing, typography, layout } from '../styles';
import ModeCard from '../../components/ModeCard';
import AppBar from '../../components/AppBar';
import Toggle from '../../components/Toggle';
import AudioRecordButton from '../../components/AudioRecordButton';
import AudioWaveform from '../../components/AudioWaveform';
import { useRecordingFlow } from '../../hooks/useRecordingFlow';

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
  onRecordingComplete: (conversationId: string) => void;
}

export default function RecordingScreen({ selectedMode, onGoBack, onRecordingComplete }: RecordingScreenProps): React.ReactElement {
  const {
    recordMode,
    currentPartner,
    isProcessing,
    conversationId,
    isCreatingConversation,
    conversationError,
    isReadyToUpload,
    uploadsComplete,
    processingComplete,
    handleToggleRecording,
    handleToggleMode,
    recordingStatus,
    isRecording,
    isUploading,
  } = useRecordingFlow(selectedMode.id, onRecordingComplete);

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
              {recordingStatus && <Text style={styles.recordingStatus}>{recordingStatus}</Text>}
              {conversationError && <Text style={styles.errorText}>{conversationError}</Text>}
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
  waveformContainer: { width: '100%', height: height * 0.15, marginBottom: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  recordingStatus: { marginTop: spacing.sm, ...typography.caption, color: colors.mediumText, textAlign: 'center' },
  errorText: { marginTop: spacing.sm, ...typography.caption, color: colors.error, textAlign: 'center' },
});