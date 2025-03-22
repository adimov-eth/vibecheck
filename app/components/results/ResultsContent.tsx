import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { colors, spacing, typography } from '../../app/styles';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface AnalysisResponse {
  summary: string;
  recommendations?: string[];
  sentiment?: string;
  additionalData?: Record<string, any>;
}

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

interface ResultsContentProps {
  mode: Mode;
  isLoading: boolean;
  processingProgress: number;
  analysisResult: AnalysisResponse | null;
  onNewRecording: () => void;
}

export default function ResultsContent({
  mode,
  isLoading,
  processingProgress,
  analysisResult,
  onNewRecording
}: ResultsContentProps) {
  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={mode.color} />
      <Text style={styles.loadingText}>Processing your conversation...</Text>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${processingProgress}%`, backgroundColor: mode.color }]} />
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
        <View style={[styles.summaryContainer, { borderColor: mode.color }]}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <Text style={styles.summaryText}>{analysisResult.summary}</Text>
        </View>

        {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
          <View style={styles.recommendationsContainer}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {analysisResult.recommendations.map((recommendation: string, index: number) => (
              <View key={index} style={styles.recommendationItem}>
                <Text style={styles.recommendationNumber}>{index + 1}</Text>
                <Text style={styles.recommendationText}>{recommendation}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity 
          style={[styles.newConversationButton, { backgroundColor: mode.color }]}
          onPress={onNewRecording}
        >
          <Text style={styles.newConversationButtonText}>New Conversation</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return isLoading ? renderLoadingState() : renderResults();
}

const styles = StyleSheet.create({
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
    backgroundColor: '#E3E9EE', // Using a light gray since lightGray is not in colors
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
    ...typography.buttonText,
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
    ...typography.buttonText,
    color: colors.white,
  },
}); 