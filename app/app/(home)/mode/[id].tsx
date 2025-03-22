import React, { useState, useCallback } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '../../styles';
import RecordingScreen from '../RecordingScreen';
import ResultsScreen from '../ResultsScreen';

type ModeParams = {
  id: string;
  title: string;
  description: string;
  color: string;
}

export default function ModePage() {
  const router = useRouter();
  const { id, title, description, color } = useLocalSearchParams();
  const [screen, setScreen] = useState<'recording' | 'results'>('recording');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{
    title: string;
    content: string;
    suggestions: string[];
  } | null>(null);

  const selectedMode = {
    id: id as string,
    title: title as string,
    description: description as string,
    color: color as string,
  };

  const handleGoBack = useCallback(() => {
    if (screen === 'results') {
      setScreen('recording');
      setResults(null);
    } else {
      router.back();
    }
  }, [screen, router]);

  const handleRecordingComplete = useCallback(() => {
    console.log('Mode page: handleRecordingComplete called');
    setIsProcessing(true);
    
    // Change screen immediately since we want to show the processing UI right away
    console.log('Mode page: Changing screen to results');
    setScreen('results');
  }, []);

  const handleNewRecording = useCallback(() => {
    setScreen('recording');
  }, []);

  // If any required param is missing, go back to home
  if (!id || !title || !description || !color) {
    router.replace('/');
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {screen === 'recording' ? (
        <RecordingScreen
          selectedMode={selectedMode}
          onGoBack={handleGoBack}
          onRecordingComplete={handleRecordingComplete}
          onNewRecording={handleNewRecording}
        />
      ) : (
        <ResultsScreen
          selectedMode={selectedMode}
          onGoBack={handleGoBack}
          onNewRecording={handleNewRecording}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});