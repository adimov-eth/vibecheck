import { ResultsView } from '@/components/conversation/ResultsView';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/styles';
import { useConversations } from '@/hooks/useApi';
import { useWebSocketResults } from '@/hooks/useWebSocket';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function Results() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const conversationId = id as string;

  // Get conversation results using the API hooks
  const { getConversationResult } = useConversations();
  const { data, isLoading, error, refetch } = getConversationResult(conversationId);
  
  // Use WebSocket for real-time updates
  const {
    isProcessing,
    isUsingWebSocket,
    isWebSocketConnected,
    processingProgress
  } = useWebSocketResults(conversationId);

  // Determine the appropriate accent color based on conversation type
  // In a real app, this would come from the conversation data or a separate API call
  const accentColor = data?.additionalData?.category === 'mediator' ? '#58BD7D' : 
                     data?.additionalData?.category === 'counselor' ? '#3B71FE' :
                     data?.additionalData?.category === 'dinner' ? '#4BC9F0' :
                     data?.additionalData?.category === 'movie' ? '#FF6838' : 
                     colors.primary;
  
  // Handle navigation back to home
  const handleGoToHome = () => {
    router.replace('/home');
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
      
      {isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.processingText}>
            Processing your conversation...
          </Text>
          
          {processingProgress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${processingProgress}%`, backgroundColor: accentColor }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>{processingProgress}%</Text>
            </View>
          )}
          
          <View style={styles.connectionInfoContainer}>
            <View style={[
              styles.connectionIndicator,
              { backgroundColor: isWebSocketConnected ? colors.success : colors.warning }
            ]} />
            <Text style={styles.connectionInfoText}>
              {isUsingWebSocket 
                ? 'Using real-time updates' 
                : 'Using background processing'}
            </Text>
          </View>
        </View>
      )}
      
      {!isProcessing && (
        <ResultsView
          isLoading={isLoading}
          progress={processingProgress}
          result={data || null}
          error={error?.message || null}
          accentColor={accentColor}
          onNewConversation={handleGoToHome}
          onRetry={() => refetch()}
        />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
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
    ...typography.body1,
    color: colors.mediumText,
    marginBottom: spacing.xl,
    textAlign: 'center',
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
    width: '80%',
    alignItems: 'center',
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
    ...typography.caption,
    marginTop: spacing.xs,
  },
  connectionInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  connectionInfoText: {
    ...typography.caption,
    color: colors.mediumText,
  },
});