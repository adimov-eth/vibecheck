import { type AnalysisResponse } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';


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
  if (isLoading) {
    return (
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
  }

  if (error) {
    return (
      <View style={styles.errorContainer} testID={`${testID}-error`}>
        <Ionicons name="alert-circle-outline" size={64} color="#dc2626" />
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        {onRetry && (
          <Button 
            title="Try Again" 
            onPress={onRetry} 
            variant="danger"
            leftIcon="refresh"
            style={styles.errorButton}
          />
        )}
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.errorContainer} testID={`${testID}-no-result`}>
        <Ionicons name="document-outline" size={64} color="#64748b" />
        <Text style={styles.errorTitle}>No Results</Text>
        <Text style={styles.errorMessage}>No analysis results available.</Text>
        <Button 
          title="New Conversation" 
          onPress={onNewConversation}
          variant="primary"
          style={styles.errorButton}
        />
      </View>
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
            <View key={index} style={styles.recommendationItem}>
              <View style={[styles.recommendationBullet, { backgroundColor: accentColor }]}>
                <Text style={styles.recommendationNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.recommendationText}>{recommendation}</Text>
            </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    marginTop: 16,
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