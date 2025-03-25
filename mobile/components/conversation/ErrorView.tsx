import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';

interface ErrorViewProps {
  message: string;
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onRetry?: () => void;
  onNewConversation?: () => void;
  testID?: string;
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  message,
  title = 'Error',
  icon = 'alert-circle-outline',
  iconColor = '#dc2626',
  onRetry,
  onNewConversation,
  testID,
}) => (
  <View style={styles.errorContainer} testID={`${testID}-error`}>
    <Ionicons name={icon} size={64} color={iconColor} />
    <Text style={styles.errorTitle}>{title}</Text>
    <Text style={styles.errorMessage}>{message}</Text>
    {onRetry && (
      <Button 
        title="Try Again" 
        onPress={onRetry} 
        variant="danger"
        leftIcon="refresh"
        style={styles.errorButton}
      />
    )}
    {onNewConversation && (
      <Button 
        title="New Conversation" 
        onPress={onNewConversation}
        variant="primary"
        style={styles.errorButton}
      />
    )}
  </View>
);

const styles = StyleSheet.create({
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
}); 