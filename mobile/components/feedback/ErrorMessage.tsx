import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ErrorMessageProps {
  message: string;
  showIcon?: boolean;
  testID?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  showIcon = true,
  testID,
}) => {
  if (!message) return null;
  
  return (
    <View 
      style={styles.container}
      testID={testID}
      accessibilityRole="alert"
    >
      {showIcon && (
        <Ionicons 
          name="alert-circle-outline" 
          size={20} 
          color="#dc2626" 
          style={styles.icon}
        />
      )}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    flex: 1,
    color: '#dc2626',
    fontSize: 14,
    lineHeight: 20,
  },
}); 