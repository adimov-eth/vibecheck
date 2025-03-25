import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface LoadingViewProps {
  progress: number;
  accentColor: string;
  testID?: string;
}

export const LoadingView: React.FC<LoadingViewProps> = ({
  progress,
  accentColor,
  testID,
}) => (
  <View style={styles.loadingContainer} testID={`${testID}-loading`}>
    <ActivityIndicator size="large" color={accentColor} />
    <Text style={styles.loadingText}>Processing your conversation...</Text>
    <View style={styles.progressContainer}>
      <View 
        style={[
          styles.progressBar, 
          { 
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: accentColor 
          }
        ]} 
      />
    </View>
    <Text style={styles.progressText}>{progress}%</Text>
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  progressContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  progressText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
}); 