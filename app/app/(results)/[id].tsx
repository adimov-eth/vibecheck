import React, { useCallback, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { useResults } from '../../hooks/useResults';
import { colors } from '../styles';
import { useRecording } from '../../contexts/RecordingContext';
import ResultsScreen from '../../components/results/ResultsScreen';
import { cancelAllPolling } from '../../hooks/useAPI';
import { useAuthToken } from '../../hooks/useAuthToken';

// Define a basic mode object for the ResultsScreen
const defaultMode = {
  id: 'default',
  title: 'Results',
  description: 'Your conversation analysis',
  color: colors.primary,
};

export default function ResultsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { setConversationId } = useRecording();
  const { validateToken } = useAuthToken();
  
  // Use our hook to handle loading and errors
  const { isLoading, error, processingProgress, refetchResults } = useResults(id || null);

  // Set up navigation handling
  const handleGoBack = useCallback(() => {
    // Cancel any ongoing polling before navigation
    if (id) {
      cancelAllPolling(id);
    }
    router.replace('/(home)');
  }, [id, router]);

  const handleNewRecording = useCallback(() => {
    // Cancel any ongoing polling before navigation
    if (id) {
      cancelAllPolling(id);
    }
    router.replace('/(home)');
  }, [id, router]);

  const handleRetry = useCallback(() => {
    if (id) {
      // Reset conversation ID to ensure proper loading
      setConversationId(id);
      // Try to fetch the results again
      refetchResults();
    } else {
      // If no ID, go back to home to start over
      router.replace('/(home)');
    }
  }, [id, refetchResults, router, setConversationId]);

  // Validate auth token when component mounts
  useEffect(() => {
    const checkAuth = async () => {
      const isValid = await validateToken();
      if (!isValid) {
        console.error('Auth token invalid, redirecting to sign-in');
        router.replace('/(auth)/sign-in');
      }
    };
    
    checkAuth();
  }, [validateToken, router]);

  // Handle Android back button
  useEffect(() => {
    const backAction = () => {
      handleGoBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove();
  }, [handleGoBack]);
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (id) {
        cancelAllPolling(id);
      }
    };
  }, [id]);

  // If there's no ID at all, show an error
  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid conversation ID</Text>
        <Text style={styles.backLink} onPress={handleGoBack}>
          Go back to home
        </Text>
      </View>
    );
  }

  // Otherwise render the results screen with error handling
  return (
    <ResultsScreen
      mode={defaultMode}
      isLoading={isLoading}
      processingProgress={processingProgress}
      error={error}
      onGoBack={handleGoBack}
      onNewRecording={handleNewRecording}
      onRetry={handleRetry}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 20,
  },
  backLink: {
    fontSize: 16,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
}); 