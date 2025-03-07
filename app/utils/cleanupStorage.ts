import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { AUDIO_DIRECTORY } from './audioStorage';

/**
 * Removes all locally stored audio recordings
 * 
 * @returns {Promise<number>} Number of files deleted
 */
export const cleanupAudioRecordings = async (): Promise<number> => {
  try {
    // Ensure directory exists before trying to read it
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIRECTORY);
    if (!dirInfo.exists) {
      return 0;
    }

    // Get list of all recordings
    const files = await FileSystem.readDirectoryAsync(AUDIO_DIRECTORY);
    
    // Delete each file
    let deletedCount = 0;
    for (const file of files) {
      const filePath = `${AUDIO_DIRECTORY}${file}`;
      await FileSystem.deleteAsync(filePath);
      deletedCount++;
    }
    
    console.log(`Deleted ${deletedCount} audio recordings`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up audio recordings:', error);
    throw error;
  }
};

/**
 * Clears any cached conversation data from AsyncStorage
 */
export const cleanupConversationCache = async (): Promise<void> => {
  try {
    // Remove recording data
    await AsyncStorage.removeItem('recordingData');
    
    // Remove analysis result
    await AsyncStorage.removeItem('analysisResult');
    
    // Remove conversation ID
    await AsyncStorage.removeItem('conversationId');
    
    // Clear upload queue
    await AsyncStorage.removeItem('uploadQueue');
    
    console.log('Cleared conversation cache from AsyncStorage');
  } catch (error) {
    console.error('Error cleaning up conversation cache:', error);
    throw error;
  }
};

/**
 * Performs a full cleanup of all audio-related data:
 * - Deletes all local audio recordings
 * - Clears any cached conversation data
 * 
 * @returns {Promise<{deletedFiles: number}>} Results of the cleanup
 */
export const performFullCleanup = async (): Promise<{deletedFiles: number}> => {
  try {
    // Clean up audio recordings
    const deletedFiles = await cleanupAudioRecordings();
    
    // Clean up conversation cache
    await cleanupConversationCache();
    
    console.log(`Full cleanup completed. Deleted ${deletedFiles} files.`);
    
    return { deletedFiles };
  } catch (error) {
    console.error('Error performing full cleanup:', error);
    throw error;
  }
}; 