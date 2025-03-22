import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { colors, spacing, typography } from '../styles';
import AppBar from '../../components/AppBar';
import { useRecording } from '../../contexts/RecordingContext';
import { useApi } from '../../hooks/useAPI';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface ResultsScreenProps {
  selectedMode: Mode;
  onGoBack: () => void;
  onNewRecording: () => void;
}

export default function ResultsScreen({ selectedMode, onGoBack, onNewRecording }: ResultsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { 
    conversationId, 
    analysisResult, 
    setAnalysisResult,
    processingProgress,
    setProcessingProgress 
  } = useRecording();
  const { pollForResult } = useApi();

  // Keep track if we've already fetched results to avoid multiple polls
  const hasPolledRef = useRef(false);

  // Track if we've started a poll for this specific conversation
  const hasStartedPollingRef = useRef<string | null>(null);

  // Use a ref instead of state to avoid rerender triggers
  const loggedFetchSkipRef = useRef(false);

  useEffect(() => {
    // Don't fetch again if we've already got results for this conversation
    if (analysisResult || hasPolledRef.current) {
      // Only log this once to avoid console spam
      if (!loggedFetchSkipRef.current) {
        console.log('Results already fetched or available, skipping fetch');
        loggedFetchSkipRef.current = true;
      }
      setIsLoading(false);
      return;
    }
    
    // Check if we've already started polling for this specific conversation
    if (conversationId && hasStartedPollingRef.current === conversationId) {
      return;
    }
    
    // Add a small delay before starting to fetch results to ensure context is fully updated
    const timer = setTimeout(() => {
      if (!conversationId) {
        console.log('No conversation ID found in context, checking localStorage');
        // If conversationId not available in context, try to start with default UI
        setIsLoading(false);
        return;
      }

      console.log(`ResultsScreen: Loading results for conversation ${conversationId}`);
      
      // Mark that we've started polling for this conversation
      hasStartedPollingRef.current = conversationId;
      
      let isMounted = true;
      
      const fetchResults = async () => {
        try {
          // Don't reset progress to 5% if it's already higher - keep the highest progress value
          if (processingProgress < 5) {
            setProcessingProgress(5);
          }
          
          const result = await pollForResult(conversationId, (progress) => {
            // Only update if the new progress is higher than current progress
            if (isMounted && progress > processingProgress) {
              setProcessingProgress(progress);
            }
          });
          
          if (isMounted) {
            console.log('Results loaded successfully:', result);
            hasPolledRef.current = true;
            setAnalysisResult(result);
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Error fetching results:', error);
          if (isMounted) {
            setIsLoading(false);
          }
        }
      };

      fetchResults();
      
      return () => {
        isMounted = false;
      };
    }, 500); // Give context time to update
    
    return () => clearTimeout(timer);
  // Reduced dependency array to minimize reruns
  }, [conversationId, analysisResult, setAnalysisResult, setProcessingProgress]);

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={selectedMode.color} />
      <Text style={styles.loadingText}>Processing your conversation...</Text>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${processingProgress}%`, backgroundColor: selectedMode.color }]} />
      </View>
      <Text style={styles.progressText}>{processingProgress}%</Text>
    </View>
  );

  const renderResults = () => {
    if (!analysisResult) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMessage}>We couldn't process your conversation. Please try again.</Text>
          <TouchableOpacity style={styles.tryAgainButton} onPress={onNewRecording}>
            <Text style={styles.tryAgainButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView 
        style={styles.resultsContainer}
        contentContainerStyle={styles.resultsContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.summaryContainer, { borderColor: selectedMode.color }]}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <Text style={styles.summaryText}>{analysisResult.summary}</Text>
        </View>

        {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
          <View style={styles.recommendationsContainer}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {analysisResult.recommendations.map((recommendation, index) => (
              <View key={index} style={styles.recommendationItem}>
                <Text style={styles.recommendationNumber}>{index + 1}</Text>
                <Text style={styles.recommendationText}>{recommendation}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity 
          style={[styles.newConversationButton, { backgroundColor: selectedMode.color }]}
          onPress={onNewRecording}
        >
          <Text style={styles.newConversationButtonText}>New Conversation</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AppBar
          title={selectedMode.title}
          showBackButton={true}
          onBackPress={onGoBack}
          showAvatar={false}
        />
        
        {isLoading ? renderLoadingState() : renderResults()}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    ...typography.heading3,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    backgroundColor: colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  progressText: {
    ...typography.body2,
    marginTop: spacing.md,
    color: colors.mediumText,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    ...typography.heading2,
    marginTop: spacing.lg,
    color: colors.error,
  },
  errorMessage: {
    ...typography.body1,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    color: colors.mediumText,
  },
  tryAgainButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.error,
    borderRadius: spacing.md,
  },
  tryAgainButtonText: {
    ...typography.button,
    color: colors.white,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    paddingHorizontal: width * 0.05,
    paddingBottom: spacing.xxl,
  },
  summaryContainer: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderRadius: spacing.md,
    backgroundColor: colors.cardBackground,
  },
  summaryTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  },
  summaryText: {
    ...typography.body1,
    lineHeight: 24,
  },
  recommendationsContainer: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.lg,
  },
  recommendationItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: spacing.md,
  },
  recommendationNumber: {
    ...typography.heading3,
    width: 30,
    color: colors.primary,
  },
  recommendationText: {
    ...typography.body1,
    flex: 1,
  },
  newConversationButton: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: spacing.md,
    alignItems: 'center',
  },
  newConversationButtonText: {
    ...typography.button,
    color: colors.white,
  },
});