import { useRecording } from '../contexts/RecordingContext';

export interface AudioStatusInfo {
  isTranscribed: boolean;
  isFailed: boolean;
  isProcessing: boolean;
  error?: string;
}

/**
 * Hook for tracking audio processing status
 * Provides simplified interface to check if audio has been processed
 */
export function useAudioStatus(audioId?: number) {
  const { audioStatus } = useRecording();

  if (!audioId) {
    // Return aggregated status for all audios if no specific ID provided
    const allAudios = Object.values(audioStatus);
    
    return {
      isAnyFailed: allAudios.some(audio => audio.status === 'failed'),
      isAllTranscribed: allAudios.length > 0 && allAudios.every(audio => audio.status === 'transcribed'),
      isAnyProcessing: allAudios.some(audio => audio.status === 'processing'),
      failedCount: allAudios.filter(audio => audio.status === 'failed').length,
      transcribedCount: allAudios.filter(audio => audio.status === 'transcribed').length,
      totalCount: allAudios.length,
      errors: allAudios
        .filter(audio => audio.status === 'failed' && audio.error)
        .map(audio => audio.error as string)
    };
  }

  // Return status for specific audio ID
  const status = audioStatus[audioId];
  
  if (!status) {
    return {
      isTranscribed: false,
      isFailed: false,
      isProcessing: false,
      exists: false
    };
  }

  return {
    isTranscribed: status.status === 'transcribed',
    isFailed: status.status === 'failed',
    isProcessing: status.status === 'processing',
    error: status.error,
    exists: true
  };
} 