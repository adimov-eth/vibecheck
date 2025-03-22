import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { performFullCleanup } from '../utils/cleanupStorage';
import { showToast } from './Toast';
import { useRecording } from '../contexts/RecordingContext';

interface ClearCacheButtonProps {
  buttonText?: string;
  showIcon?: boolean;
}

export const ClearCacheButton = ({ 
  buttonText = 'Clear Cache', 
  showIcon = true 
}: ClearCacheButtonProps) => {
  const [isClearing, setIsClearing] = useState(false);
  const { clearRecordings } = useRecording();
  
  const handleClearCache = async () => {
    try {
      setIsClearing(true);
      
      // Perform the full cleanup
      const { deletedFiles } = await performFullCleanup();
      
      // Also clear the recording context
      clearRecordings();
      
      // Show success toast
      showToast.success(
        'Cache Cleared', 
        `Successfully deleted ${deletedFiles} recording${deletedFiles !== 1 ? 's' : ''} and cleared conversation data.`
      );
    } catch (error) {
      console.error('Error clearing cache:', error);
      showToast.error('Error', 'Failed to clear cache. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };
  
  return (
    <TouchableOpacity 
      style={styles.button} 
      onPress={handleClearCache}
      disabled={isClearing}
    >
      {isClearing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{buttonText}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#dc3545',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
}); 