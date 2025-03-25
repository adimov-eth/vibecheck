import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnalysisResponse } from '../../types/analysis';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorView } from './ErrorView';
import { LoadingView } from './LoadingView';

interface ResultsViewProps {
  isLoading: boolean;
  progress: number;
  result: AnalysisResponse | null;
  error: string | null;
  accentColor: string;
  onNewConversation: () => void;
  onRetry?: () => void;
  testID?: string;
}

interface RecommendationProps {
  text: string;
  index: number;
  accentColor: string;
}

const Recommendation: React.FC<RecommendationProps> = ({ text, index, accentColor }) => (
  <View style={styles.recommendationItem}>
    <View style={[styles.recommendationBullet, { backgroundColor: accentColor }]}>
      <Text style={styles.recommendationNumber}>{index + 1}</Text>
    </View>
    <Text style={styles.recommendationText}>{text}</Text>
  </View>
);

/**
 * Displays the analysis results of a conversation, including loading state,
 * errors, and the actual analysis content.
 */
export const ResultsView: React.FC<ResultsViewProps> = ({
  isLoading,
  progress,
  result,
  error,
  accentColor,
  onNewConversation,
  onRetry,
  testID,
}) => {
  // Handle loading state
  if (isLoading) {
    return (
      <LoadingView
        progress={progress}
        accentColor={accentColor}
        testID={testID}
      />
    );
  }

  // Handle error state
  if (error) {
    return (
      <ErrorView
        message={error}
        onRetry={onRetry}
        onNewConversation={onNewConversation}
        testID={testID}
      />
    );
  }

  // Handle missing results
  if (!result) {
    return (
      <ErrorView
        message="No analysis results available. Please try starting a new conversation."
        title="No Results"
        icon="document-outline"
        iconColor="#64748b"
        onNewConversation={onNewConversation}
        testID={testID}
      />
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      testID={testID}
    >
      <Card style={[styles.summaryCard, { borderColor: accentColor }]}>
        <Text style={styles.summaryTitle}>Summary</Text>
        <Text style={styles.summaryText}>{result.summary}</Text>
      </Card>

      {result.recommendations && result.recommendations.length > 0 && (
        <Card style={styles.recommendationsCard}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          {result.recommendations.map((recommendation, index) => (
            <Recommendation
              key={index}
              text={recommendation}
              index={index}
              accentColor={accentColor}
            />
          ))}
        </Card>
      )}

      <Button 
        title="New Conversation" 
        onPress={onNewConversation}
        variant="primary"
        size="large"
        style={styles.newButton}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryCard: {
    marginBottom: 24,
    borderLeftWidth: 4,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
  },
  recommendationsCard: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  recommendationItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  recommendationBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  recommendationNumber: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  recommendationText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
  },
  newButton: {
    marginTop: 16,
  },
}); 