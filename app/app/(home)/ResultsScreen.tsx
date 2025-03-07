import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  ActivityIndicator, 
  Dimensions,
  TouchableOpacity
} from 'react-native';
import { colors, spacing, typography, layout } from '../styles';
import AppBar from '../../components/AppBar';
import { Ionicons } from '@expo/vector-icons';
import { useApi, AnalysisResponse } from '../../utils/apiService';
import Button from '../../components/Button';
import { useRecording } from '../../contexts/RecordingContext';
import { showToast } from '../../components/Toast';

const { width, height } = Dimensions.get('window');

interface ResultsScreenProps {
  onGoBack: () => void;
  onNewRecording: () => void;
}

interface ApiMethods {
  getConversationStatus: (conversationId: string) => Promise<any>;
  parseGptResponse: (gptResponse: string) => AnalysisResponse;
  // Add other methods you might need
}

export default function ResultsScreen({ 
  onGoBack,
  onNewRecording
}: ResultsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { 
    recordingData, 
    conversationId,
    clearRecordings 
  } = useRecording();

  // Call the hook at the top level of the component
  const api = useApi();
  
  // Clean up when unmounting
  useEffect(() => {
    return () => {
      // Only clear if navigating away, not during processing
      if (!loading) {
        clearRecordings();
      }
    };
  }, [loading]);

  // Poll for conversation status when data is available
  useEffect(() => {
    if (!recordingData || !conversationId) {
      setLoading(false);
      return;
    }

    const pollStatus = async () => {
      try {
        // More informative progress updates
        const updateProgressWithStatus = (baseProgress: number, step: string) => {
          setProgress(baseProgress);
          console.log(`Analysis step: ${step} at ${baseProgress}%`);
        };

        // Start with processing step
        updateProgressWithStatus(10, 'Processing audio');
        
        const interval = setInterval(() => {
          setProgress(p => {
            // Gradually increase progress within current phase
            if (p < 24) return Math.min(p + 2, 24); // Processing phase
            if (p < 49) return Math.min(p + 2, 49); // Transcription phase  
            if (p < 74) return Math.min(p + 2, 74); // Analysis phase
            if (p < 95) return Math.min(p + 1, 95); // Finalizing phase
            return p;
          });
        }, 1500);
        
        // Set maximum retry limit and polling interval
        const MAX_RETRIES = 30; // 30 attempts = 60 seconds with 2-second interval
        const BASE_POLLING_INTERVAL = 2000; // 2 seconds
        const ERROR_RETRY_INTERVAL = 3000; // 3 seconds after error
        const USE_EXPONENTIAL_BACKOFF = false; // Enable for exponential backoff
        
        let retryCount = 0;
        let currentPollingInterval = BASE_POLLING_INTERVAL;
        
        while (retryCount < MAX_RETRIES) {
          try {
            const { status, gptResponse } = await api.getConversationStatus(conversationId);
            
            // Update progress based on status response
            if (status === "processing") {
              updateProgressWithStatus(25, 'Processing audio');
            } else if (status === "transcribing") {
              updateProgressWithStatus(50, 'Transcribing');
            } else if (status === "analyzing") {
              updateProgressWithStatus(75, 'Analyzing');
            }
            
            if (status === "completed" && gptResponse) {
              clearInterval(interval);
              updateProgressWithStatus(100, 'Completed');
              const result = api.parseGptResponse(gptResponse);
              setAnalysisResult(result);
              break;
            }
            
            if (status === "failed") {
              clearInterval(interval);
              throw new Error("Conversation processing failed");
            }
            
            // Increment retry counter
            retryCount++;
            
            // Calculate next polling interval (with or without exponential backoff)
            if (USE_EXPONENTIAL_BACKOFF) {
              // Exponential backoff: 2s, 4s, 8s, etc. with a reasonable maximum
              currentPollingInterval = Math.min(BASE_POLLING_INTERVAL * Math.pow(2, retryCount - 1), 10000);
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, currentPollingInterval));
          } catch (networkError) {
            retryCount++;
            console.error(`Network error during polling (attempt ${retryCount}/${MAX_RETRIES}):`, networkError);
            
            // If we've reached max retries, throw the error to exit the loop
            if (retryCount >= MAX_RETRIES) {
              throw new Error("Max polling attempts reached");
            }
            
            // Show toast for network error
            showToast.networkError(
              'Connection Issue',
              'Having trouble connecting to the server. Will retry automatically.'
            );
            
            // Wait longer before retrying after a network error
            await new Promise(resolve => setTimeout(resolve, ERROR_RETRY_INTERVAL));
          }
        }
        
        // If we've exhausted all retries without success or break
        if (retryCount >= MAX_RETRIES) {
          clearInterval(interval);
          throw new Error("Max polling attempts reached without completion");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
        setError(errorMessage);
        showToast.error('Analysis Error', errorMessage);
      } finally {
        setLoading(false);
      }
    };

    pollStatus();
  }, [conversationId, recordingData]);

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle" size={48} color={colors.error} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <Button
        title="Try Again"
        onPress={onNewRecording}
        size="medium"
        style={styles.retryButton}
      />
    </View>
  );

  const renderHighlights = (highlights: string[] = [], partner: string) => {
    if (!highlights || highlights.length === 0) {
      return null;
    }
    
    return highlights.map((highlight, index) => (
      <View key={`${partner}-${index}`} style={styles.highlightItem}>
        <Ionicons 
          name="checkmark-circle" 
          size={16} 
          color={colors.success} 
          style={styles.highlightIcon} 
        />
        <Text style={styles.highlightText}>{highlight}</Text>
      </View>
    ));
  };

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} style={styles.mainLoader} />
      <Text style={styles.sectionTitle}>
        Processing your conversation
      </Text>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${progress}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {progress < 100 
            ? `Analyzing your conversation: ${progress}%` 
            : 'Analysis complete!'}
        </Text>
      </View>
      
      <View style={styles.processingSteps}>
        <View style={[styles.stepItem, progress >= 25 ? styles.completedStep : {}]}>
          <Ionicons 
            name={progress >= 25 ? "checkmark-circle" : "time-outline"} 
            size={20} 
            color={progress >= 25 ? colors.success : colors.mediumText} 
          />
          <Text style={styles.stepText}>Processing audio</Text>
          {progress < 25 && progress > 0 && (
            <ActivityIndicator 
              size="small" 
              color={colors.mediumText} 
              style={styles.stepLoader}
            />
          )}
        </View>
        
        <View style={[styles.stepItem, progress >= 50 ? styles.completedStep : {}]}>
          <Ionicons 
            name={progress >= 50 ? "checkmark-circle" : "time-outline"} 
            size={20} 
            color={progress >= 50 ? colors.success : colors.mediumText} 
          />
          <Text style={styles.stepText}>Transcribing</Text>
          {progress >= 25 && progress < 50 && (
            <ActivityIndicator 
              size="small" 
              color={colors.mediumText} 
              style={styles.stepLoader}
            />
          )}
        </View>
        
        <View style={[styles.stepItem, progress >= 75 ? styles.completedStep : {}]}>
          <Ionicons 
            name={progress >= 75 ? "checkmark-circle" : "time-outline"} 
            size={20} 
            color={progress >= 75 ? colors.success : colors.mediumText} 
          />
          <Text style={styles.stepText}>Analyzing</Text>
          {progress >= 50 && progress < 75 && (
            <ActivityIndicator 
              size="small" 
              color={colors.mediumText} 
              style={styles.stepLoader}
            />
          )}
        </View>
        
        <View style={[styles.stepItem, progress >= 100 ? styles.completedStep : {}]}>
          <Ionicons 
            name={progress >= 100 ? "checkmark-circle" : "time-outline"} 
            size={20} 
            color={progress >= 100 ? colors.success : colors.mediumText} 
          />
          <Text style={styles.stepText}>Finalizing</Text>
          {progress >= 75 && progress < 100 && (
            <ActivityIndicator 
              size="small" 
              color={colors.mediumText} 
              style={styles.stepLoader}
            />
          )}
        </View>
      </View>
      
      <Text style={styles.statusMessage}>
        {progress < 25 ? 'Processing audio files...' : 
         progress < 50 ? 'Converting speech to text...' :
         progress < 75 ? 'Analyzing conversation patterns...' :
         progress < 100 ? 'Generating insights...' : 
         'Analysis complete! Loading results...'}
      </Text>
    </View>
  );

  const renderResult = () => {    
    return (
      <ScrollView 
        style={styles.resultContainer}
        contentContainerStyle={styles.resultContent}
        showsVerticalScrollIndicator={false}
      >
        {analysisResult && (
          <>
            {/* Summary Section */}
            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>{analysisResult.summary}</Text>
              </View>
            </View>

            {/* Recommendations Section */}
            {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
              <View style={styles.recommendationsSection}>
                <Text style={styles.sectionTitle}>Recommendations</Text>
                <View style={styles.recommendationsCard}>
                  {analysisResult.recommendations.map((recommendation: string, index: number) => (
                    <View key={index} style={styles.recommendationItem}>
                      <Text style={styles.recommendationNumber}>
                        {index + 1}
                      </Text>
                      <Text style={styles.recommendationText}>{recommendation}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Highlights Section */}
            {analysisResult.highlights && (
              <View style={styles.highlightsSection}>
                <Text style={styles.sectionTitle}>Key Points</Text>
                <View style={styles.highlightsContainer}>
                  {analysisResult.highlights.partner1 && analysisResult.highlights.partner1.length > 0 && (
                    <View style={styles.partnerColumn}>
                      <Text style={styles.partnerTitle}>Partner 1</Text>
                      <View style={styles.highlightsList}>
                        {renderHighlights(analysisResult.highlights.partner1, 'partner1')}
                      </View>
                    </View>
                  )}

                  {analysisResult.highlights?.partner2 && analysisResult.highlights.partner2.length > 0 && (
                    <View style={styles.partnerColumn}>
                      <Text style={styles.partnerTitle}>Partner 2</Text>
                      <View style={styles.highlightsList}>
                        {renderHighlights(analysisResult.highlights.partner2, 'partner2')}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Button
                title="New Recording"
                onPress={onNewRecording}
                size="large"
              />
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  // Determine what to render based on state
  const renderContent = () => {
    if (loading) {
      return renderLoading();
    }
    
    if (error && !analysisResult?.summary) {
      return renderError();
    }
    
    // If we have a result with a summary, show it even if there was an error
    if (analysisResult?.summary) {
      return renderResult();
    }
    
    // Display a waiting state if nothing else matches
    return (
      <View style={styles.waitingContainer}>
        <Text style={styles.waitingText}>
          Waiting for recording data...
        </Text>
        <Button
          title="Record a Conversation"
          onPress={onNewRecording}
          size="medium"
          style={styles.newRecordingButton}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AppBar
          showBackButton={true}
          onBackPress={onGoBack}
          title="Results"
          showAvatar={false}
        />
        
        <View style={styles.content}>
          {renderContent()}
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: width * 0.05,
    paddingBottom: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: height * 0.1,
  },
  mainLoader: {
    marginBottom: spacing.md,
  },
  progressContainer: {
    width: '90%',
    marginVertical: spacing.xl,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.body2,
    color: colors.darkText,
    marginTop: spacing.md,
  },
  processingSteps: {
    width: '90%',
    marginTop: spacing.xl,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
  },
  completedStep: {
    backgroundColor: 'rgba(88, 189, 125, 0.1)',
  },
  stepText: {
    ...typography.body2,
    color: colors.darkText,
    marginLeft: spacing.md,
    flex: 1,
  },
  stepLoader: {
    marginLeft: spacing.sm,
  },
  statusMessage: {
    ...typography.body2,
    color: colors.primary,
    marginTop: spacing.xl,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: height * 0.1,
  },
  errorTitle: {
    ...typography.heading2,
    color: colors.error,
    marginTop: spacing.md,
  },
  errorMessage: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  retryButton: {
    marginTop: spacing.md,
  },
  resultContainer: {
    flex: 1,
  },
  resultContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  },
  summarySection: {
    marginBottom: spacing.xl,
  },
  summaryCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.lg,
    ...layout.cardShadow,
  },
  summaryText: {
    ...typography.body1,
    color: colors.darkText,
  },
  recommendationsSection: {
    marginBottom: spacing.xl,
  },
  recommendationsCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.lg,
    ...layout.cardShadow,
  },
  recommendationItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  recommendationNumber: {
    ...typography.body1,
    fontFamily: 'Inter-SemiBold',
    color: colors.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 113, 254, 0.1)',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: spacing.md,
  },
  recommendationText: {
    ...typography.body1,
    color: colors.darkText,
    flex: 1,
  },
  highlightsSection: {
    marginBottom: spacing.xxl,
  },
  highlightsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  partnerColumn: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.lg,
    ...layout.cardShadow,
    marginRight: spacing.md,
  },
  partnerTitle: {
    ...typography.body1,
    fontFamily: 'Inter-SemiBold',
    color: colors.darkText,
    marginBottom: spacing.md,
  },
  highlightsList: {
    flex: 1,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  highlightIcon: {
    marginTop: 2,
    marginRight: spacing.sm,
  },
  highlightText: {
    ...typography.body2,
    color: colors.darkText,
    flex: 1,
  },
  actionButtons: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  waitingText: {
    ...typography.heading2,
    color: colors.darkText,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  newRecordingButton: {
    marginTop: spacing.md,
  },
});