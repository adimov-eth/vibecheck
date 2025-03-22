import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioStatus } from '../hooks/useAudioStatus';
import { useWebSocketResults } from '../hooks/useWebSocketResults';
import { useRecording } from '../contexts/RecordingContext';

interface AudioStatusIndicatorProps {
  audioId?: number; // Optional audio ID; if not provided, shows overall status
  showDetails?: boolean;
}

/**
 * Component that displays real-time audio processing status
 * Uses WebSocket updates to show transcription progress
 */
export function AudioStatusIndicator({ audioId, showDetails = false }: AudioStatusIndicatorProps) {
  const { conversationId } = useRecording();
  const { isWebSocketConnected } = useWebSocketResults(conversationId);
  
  // Call hooks unconditionally
  const specificStatus = useAudioStatus(audioId);
  const aggregateStatus = useAudioStatus();
  
  // If we have a specific audio ID, show detailed status for that audio
  if (audioId) {
    return (
      <View style={styles.container}>
        {specificStatus.isProcessing && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.statusText}>Processing audio...</Text>
          </View>
        )}
        
        {specificStatus.isTranscribed && (
          <View style={styles.statusRow}>
            <Text style={styles.successText}>✓ Audio transcribed</Text>
          </View>
        )}
        
        {specificStatus.isFailed && (
          <View style={styles.statusRow}>
            <Text style={styles.errorText}>⚠️ Processing failed</Text>
            {specificStatus.error && showDetails && (
              <Text style={styles.errorDetail}>{specificStatus.error}</Text>
            )}
          </View>
        )}
        
        {!specificStatus.exists && !specificStatus.isProcessing && 
         !specificStatus.isTranscribed && !specificStatus.isFailed && (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>Waiting for audio...</Text>
          </View>
        )}
        
        {showDetails && (
          <Text style={styles.connectionStatus}>
            WebSocket: {isWebSocketConnected ? 'Connected' : 'Disconnected'}
          </Text>
        )}
      </View>
    );
  }
  
  // Otherwise show aggregate status for all audios
  return (
    <View style={styles.container}>
      {aggregateStatus.isAnyProcessing && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.statusText}>
            Processing audio {aggregateStatus.transcribedCount}/{aggregateStatus.totalCount}
          </Text>
        </View>
      )}
      
      {aggregateStatus.isAllTranscribed && (
        <View style={styles.statusRow}>
          <Text style={styles.successText}>
            ✓ All audio transcribed ({aggregateStatus.totalCount})
          </Text>
        </View>
      )}
      
      {aggregateStatus.isAnyFailed && (
        <View style={styles.statusRow}>
          <Text style={styles.errorText}>
            ⚠️ {aggregateStatus.failedCount} audio(s) failed
          </Text>
          {showDetails && aggregateStatus.errors.length > 0 && (
            <Text style={styles.errorDetail}>
              {aggregateStatus.errors[0]}
              {aggregateStatus.errors.length > 1 && ` (+${aggregateStatus.errors.length - 1} more)`}
            </Text>
          )}
        </View>
      )}
      
      {aggregateStatus.totalCount === 0 && (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>No audio processed yet</Text>
        </View>
      )}
      
      {showDetails && (
        <Text style={styles.connectionStatus}>
          WebSocket: {isWebSocketConnected ? 'Connected' : 'Disconnected'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#555',
  },
  successText: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '500',
  },
  errorDetail: {
    fontSize: 12,
    color: '#dc3545',
    marginTop: 4,
  },
  connectionStatus: {
    fontSize: 12,
    color: '#777',
    marginTop: 8,
  },
}); 