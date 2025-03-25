import { ResultsView } from '@/components/conversation/ResultsView';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/styles';
import { useConversation } from '@/hooks/useConversation';
import { useConversationResult } from '@/hooks/useConversationResult';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function Results() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const conversationId = id as string;

  // Get conversation details and results
  const { conversation, isLoading: conversationLoading } = useConversation(conversationId);
  const { 
    data: result, 
    isLoading, 
    error, 
    refetch 
  } = useConversationResult(conversationId);

  // Determine the appropriate accent color based on conversation mode
  const accentColor = conversation?.mode === 'mediator' ? '#58BD7D' : 
                     conversation?.mode === 'counselor' ? '#3B71FE' : 
                     colors.primary;
  
  // Handle navigation back to home
  const handleGoToHome = () => {
    router.replace('../home');
  };
  
  // If there's no ID, show an error and navigate home
  if (!conversationId) {
    return (
      <Container withSafeArea>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Missing Conversation ID</Text>
          <Text style={styles.errorMessage}>Unable to load conversation results</Text>
          <Button 
            title="Go Home" 
            onPress={handleGoToHome}
            variant="primary"
          />
        </View>
      </Container>
    );
  }

  return (
    <Container withSafeArea>
      <AppBar 
        title="Results" 
        showBackButton 
        onBackPress={handleGoToHome} 
      />
      
      {result?.status === 'processing' && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.processingText}>
            Processing your conversation...
          </Text>
          
          {result?.progress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${result.progress}%`, backgroundColor: accentColor }
                  ]} 
                />
              </View>
              <Text style={[styles.progressText, typography.label2]}>
                {result.progress}%
              </Text>
            </View>
          )}
          
          <View style={styles.connectionInfoContainer}>
            <View style={[
              styles.connectionIndicator,
              { backgroundColor: result ? colors.success : colors.warning }
            ]} />
            <Text style={[styles.connectionInfoText, typography.label2]}>
              Using real-time updates
            </Text>
          </View>
        </View>
      )}
      
      {result?.status !== 'processing' && (
        <ResultsView
          isLoading={isLoading || conversationLoading}
          result={result || null}
          error={error?.message || result?.error || null}
          accentColor={accentColor}
          onNewConversation={handleGoToHome}
          onRetry={() => refetch()}
          progress={result?.progress || 0}
        />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    ...typography.heading2,
    marginBottom: spacing.md,
  },
  errorMessage: {
    marginBottom: spacing.xl,
    textAlign: 'center',
    color: colors.text.secondary,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  processingText: {
    ...typography.body1,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  progressContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  progressBackground: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  progressText: {
    marginTop: spacing.xs,
    color: colors.text.secondary,
  },
  connectionInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  connectionInfoText: {
    color: colors.text.secondary,
  },
});