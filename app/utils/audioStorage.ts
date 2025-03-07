import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// Directory for storing audio recordings
const AUDIO_DIRECTORY = `${FileSystem.documentDirectory}audio/`;

// Ensure the audio directory exists
export const ensureAudioDirectoryExists = async (): Promise<void> => {
  const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIRECTORY);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIRECTORY, { intermediates: true });
  }
};

// Generate a unique filename for recordings
export const generateAudioFilename = (prefix: string): string => {
  const timestamp = new Date().getTime();
  const randomString = Math.random().toString(36).substring(2, 10);
  const extension = Platform.OS === 'ios' ? 'm4a' : 'wav';
  return `${prefix}_${timestamp}_${randomString}.${extension}`;
};

// Save a recording to the file system
export const saveAudioRecording = async (
  uri: string,
  partnerPrefix: string
): Promise<string> => {
  try {
    await ensureAudioDirectoryExists();
    
    const newFilename = generateAudioFilename(partnerPrefix);
    const newUri = `${AUDIO_DIRECTORY}${newFilename}`;
    
    // Copy the temporary recording file to our app's documents directory
    await FileSystem.copyAsync({
      from: uri,
      to: newUri
    });
    
    // Delete the original temporary file to prevent accumulation of unused temp files
    const tempFileInfo = await FileSystem.getInfoAsync(uri);
    if (tempFileInfo.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
    
    return newUri;
  } catch (error) {
    console.error('Error saving audio recording:', error);
    throw error;
  }
};

// Delete a recording from the file system
export const deleteAudioRecording = async (uri: string): Promise<void> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch (error) {
    console.error('Error deleting audio recording:', error);
    throw error;
  }
};

// Get information about a recording file (size, etc.)
export const getAudioFileInfo = async (uri: string): Promise<FileSystem.FileInfo> => {
  try {
    return await FileSystem.getInfoAsync(uri, { size: true });
  } catch (error) {
    console.error('Error getting audio file info:', error);
    throw error;
  }
};

// List all saved recordings
export const listAllRecordings = async (): Promise<string[]> => {
  try {
    await ensureAudioDirectoryExists();
    const files = await FileSystem.readDirectoryAsync(AUDIO_DIRECTORY);
    return files.map(file => `${AUDIO_DIRECTORY}${file}`);
  } catch (error) {
    console.error('Error listing recordings:', error);
    throw error;
  }
}; 