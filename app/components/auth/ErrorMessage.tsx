/**
 * Error Message Component
 * Displays error messages in a consistent format across the app
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../app/styles';

interface ErrorMessageProps {
  /** Error message to display */
  message: string;
  /** Whether to show the error icon */
  showIcon?: boolean;
  /** Custom style to apply to the container */
  containerStyle?: object;
  /** Custom style to apply to the error text */
  textStyle?: object;
  /** Optional testID for testing */
  testID?: string;
}

/**
 * Reusable error message display
 * @param props - Component properties
 * @returns JSX.Element or null if no message
 */
export function ErrorMessage({
  message,
  showIcon = true,
  containerStyle,
  textStyle,
  testID,
}: ErrorMessageProps): JSX.Element | null {
  // Don't render anything if there's no error message
  if (!message) return null;
  
  return (
    <View 
      style={[styles.container, containerStyle]}
      testID={testID}
      accessibilityRole="alert"
    >
      {showIcon && (
        <Ionicons 
          name="alert-circle-outline" 
          size={20} 
          color={colors.error || '#FF3B30'} 
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, textStyle]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    flex: 1,
    color: colors.error || '#FF3B30',
    ...typography.body2,
  },
});
