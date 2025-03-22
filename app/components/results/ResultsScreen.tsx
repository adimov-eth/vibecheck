import React from 'react';
import { SafeAreaView, View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { colors } from '../../app/styles';
import AppBar from '../AppBar';
import ResultsContent from './ResultsContent';
import { useRecording } from '../../contexts/RecordingContext';

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface ResultsScreenProps {
  mode: Mode;
  isLoading: boolean;
  processingProgress: number;
  error: string | null;
  onGoBack: () => void;
  onNewRecording: () => void;
  onRetry?: () => void;
}

export default function ResultsScreen({
  mode,
  isLoading,
  processingProgress,
  error,
  onGoBack,
  onNewRecording,
  onRetry
}: ResultsScreenProps) {
  const { analysisResult } = useRecording();

  // Handle retry logic
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      onNewRecording();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AppBar
          title={mode.title}
          showBackButton={true}
          onBackPress={onGoBack}
          showAvatar={false}
        />
        
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: mode.color }]} 
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ResultsContent
            mode={mode}
            isLoading={isLoading}
            processingProgress={processingProgress}
            analysisResult={analysisResult}
            onNewRecording={onNewRecording}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
}); 