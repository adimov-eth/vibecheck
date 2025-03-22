import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useWebSocket } from '../utils/websocketManager';
import { API_BASE_URL } from '../utils/apiEndpoints';
import { getWebSocketUrl } from '../utils/websocketManager';
import { useAuthToken } from '../hooks/useAuthToken';

// Type for conversation progress data
interface ConversationProgress {
  progress: number;
  step: string;
  stepDescription?: string;
}

// Type for conversation result data
interface ConversationResult {
  id: string;
  summary: string;
  feedback: Record<string, any>;
  createdAt: string;
  completedAt: string;
}

interface ConversationViewProps {
  conversationId: string;
}

const ConversationView = ({ conversationId }: ConversationViewProps) => {
  const [progress, setProgress] = useState<ConversationProgress | null>(null);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { getFreshToken } = useAuthToken();
  
  // Set up WebSocket connection
  const { 
    connectionState, 
    subscribe, 
    unsubscribe, 
    on, 
    off,
    reconnect 
  } = useWebSocket(
    getWebSocketUrl(API_BASE_URL),
    {
      getAuthToken: getFreshToken,
      debug: __DEV__, // Enable debug logs in development
      onError: (event) => {
        console.error('WebSocket error in ConversationView:', event);
      }
    }
  );

  useEffect(() => {
    // Define message handlers
    const handleProgress = (message: any) => {
      if (message.conversationId === conversationId) {
        console.log('Received progress update:', message);
        setProgress({
          progress: message.progress,
          step: message.step,
          stepDescription: message.stepDescription
        });
      }
    };

    const handleCompleted = (message: any) => {
      if (message.conversationId === conversationId) {
        console.log('Conversation completed:', message);
        setResult(message.result);
        // Unsubscribe after completion to stop listening
        unsubscribe(`conversation:${conversationId}`);
      }
    };

    const handleFailed = (message: any) => {
      if (message.conversationId === conversationId) {
        console.error('Conversation failed:', message);
        setError(message.error || 'Processing failed');
        // Unsubscribe after failure to stop listening
        unsubscribe(`conversation:${conversationId}`);
      }
    };

    // Register message handlers
    on('conversation_progress', handleProgress);
    on('conversation_completed', handleCompleted);
    on('conversation_failed', handleFailed);

    // When connected, subscribe to conversation updates
    if (connectionState === 'authenticated') {
      console.log(`Subscribing to conversation ${conversationId} updates`);
      subscribe(`conversation:${conversationId}`);
    }

    // Clean up handlers and subscription on unmount
    return () => {
      off('conversation_progress', handleProgress);
      off('conversation_completed', handleCompleted);
      off('conversation_failed', handleFailed);
      unsubscribe(`conversation:${conversationId}`);
    };
  }, [conversationId, connectionState, subscribe, unsubscribe, on, off]);

  // Handle reconnection when authentication state changes
  useEffect(() => {
    if (connectionState === 'authenticated') {
      subscribe(`conversation:${conversationId}`);
    }
  }, [connectionState, conversationId, subscribe]);

  // Display appropriate UI based on conversation state
  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Processing Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      );
    }

    if (result) {
      return (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Analysis Complete</Text>
          <Text style={styles.resultSummary}>{result.summary}</Text>
          
          {/* Render additional result details as needed */}
          <View style={styles.feedbackContainer}>
            {Object.entries(result.feedback).map(([key, value]) => (
              <Text key={key} style={styles.feedbackItem}>
                <Text style={styles.feedbackLabel}>{key}: </Text>
                <Text>{typeof value === 'object' ? JSON.stringify(value) : value}</Text>
              </Text>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.progressContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.progressTitle}>
          {progress ? `${progress.step}` : 'Initializing...'}
        </Text>
        {progress && progress.stepDescription && (
          <Text style={styles.progressDescription}>{progress.stepDescription}</Text>
        )}
        {progress && (
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${Math.min(100, Math.max(0, progress.progress))}%` }
              ]} 
            />
          </View>
        )}
      </View>
    );
  };

  // Show connection status if not connected/authenticated
  const renderConnectionStatus = () => {
    if (connectionState !== 'authenticated' && connectionState !== 'connected') {
      return (
        <View style={styles.connectionStatus}>
          <Text style={styles.connectionText}>
            {connectionState === 'connecting' ? 'Connecting...' : 
             connectionState === 'disconnected' ? 'Disconnected' : 
             'Connection error'}
          </Text>
          {(connectionState === 'disconnected' || connectionState === 'error') && (
            <Text 
              style={styles.reconnectText}
              onPress={reconnect}
            >
              Tap to reconnect
            </Text>
          )}
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {renderConnectionStatus()}
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  connectionStatus: {
    backgroundColor: '#FFE8E6',
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
    alignItems: 'center',
  },
  connectionText: {
    color: '#CC0000',
    fontWeight: '500',
  },
  reconnectText: {
    color: '#0066CC',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  progressDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    width: '100%',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  resultContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultSummary: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  feedbackContainer: {
    marginTop: 16,
  },
  feedbackItem: {
    fontSize: 14,
    marginBottom: 8,
  },
  feedbackLabel: {
    fontWeight: '600',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FFE8E6',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#CC0000',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CC0000',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#333',
  },
});

export default ConversationView; 