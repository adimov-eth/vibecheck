import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import * as FileSystem from "expo-file-system";

const API_BASE_URL = "http://192.168.1.66:3000"; // API server URL

const UPLOAD_TASK = 'upload-task';

// Define upload item interface
interface UploadItem {
  conversationId: string;
  fileUri: string;
  status: 'pending' | 'uploaded' | 'failed';
  retryCount?: number;
  addedAt?: string;
  lastRetry?: string;
  error?: string;
}

// Define the background task
TaskManager.defineTask(UPLOAD_TASK, async () => {
    try {
      const queue = await AsyncStorage.getItem('uploadQueue');
      if (!queue) return BackgroundFetch.BackgroundFetchResult.NoData;
  
      const uploads = JSON.parse(queue);
      const token = await AsyncStorage.getItem('auth_token');
  
      if (!token) {
        console.error('No auth token available for background upload');
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
  
      let hasChanges = false;
      for (const upload of uploads) {
        if (upload.status === 'pending') {
          try {
            const formData = new FormData();
            const fileName = upload.fileUri.split("/").pop() || "audio.webm";
            let mimeType = "audio/webm";
            if (fileName.endsWith('.m4a')) mimeType = "audio/x-m4a";
            else if (fileName.endsWith('.wav')) mimeType = "audio/wav";
            
            formData.append("audio", { uri: upload.fileUri, name: fileName, type: mimeType } as any);
            formData.append("conversationId", upload.conversationId);
  
            const response = await fetch(`${API_BASE_URL}/audio`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
  
            if (response.ok) {
              upload.status = 'uploaded';
              hasChanges = true;
              console.log(`Successfully uploaded ${fileName}`);
            } else {
              console.error(`Upload failed for ${fileName}: ${response.status} - ${await response.text()}`);
            }
          } catch (error) {
            console.error(`Upload failed for file:`, error);
          }
        }
      }
  
      if (hasChanges) {
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(uploads));
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
  
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.error('Background upload failed:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });

// Register the background task
export const registerUploadTask = async () => {
  await BackgroundFetch.registerTaskAsync(UPLOAD_TASK, {
    minimumInterval: 15 * 60, // 15 minutes
    stopOnTerminate: false,
    startOnBoot: true,
  });
};

// Add recording to upload queue
export const addToUploadQueue = async (conversationId: string, fileUri: string) => {
  const queue = await AsyncStorage.getItem('uploadQueue');
  const uploads: UploadItem[] = queue ? JSON.parse(queue) : [];
  
  // Check if this file is already in the queue
  const existingIndex = uploads.findIndex((u: UploadItem) => u.fileUri === fileUri);
  
  if (existingIndex >= 0) {
    // Already in queue, update it only if not already uploaded
    if (uploads[existingIndex].status !== 'uploaded') {
      uploads[existingIndex] = {
        ...uploads[existingIndex],
        conversationId,
        status: 'pending',
        retryCount: (uploads[existingIndex].retryCount || 0) + 1,
        lastRetry: new Date().toISOString()
      };
    }
  } else {
    // Add new entry
    uploads.push({
      conversationId,
      fileUri,
      status: 'pending',
      retryCount: 0,
      addedAt: new Date().toISOString()
    });
  }
  
  await AsyncStorage.setItem('uploadQueue', JSON.stringify(uploads));
  
  // Try to upload immediately
  await uploadPendingFiles();
};

// Function to get the first valid conversation ID from the uploads in queue
const findPrimaryConversationId = async (uploads: UploadItem[]): Promise<string | null> => {
  // First, try to find from partner1 recordings
  for (const upload of uploads) {
    try {
      const metadataUri = `${upload.fileUri}.metadata.json`;
      const metadataExists = await FileSystem.getInfoAsync(metadataUri);
      if (metadataExists.exists) {
        const metadata = JSON.parse(await FileSystem.readAsStringAsync(metadataUri));
        if (metadata && metadata.conversationId && metadata.partnerPrefix === 'partner1') {
          console.log(`Found primary conversation ID ${metadata.conversationId} from partner1 recording`);
          return metadata.conversationId;
        }
      }
    } catch (err) {
      console.error('Error reading metadata during primary ID search:', err);
    }
  }
  
  // If no partner1 recording found, return the first available ID
  if (uploads.length > 0 && uploads[0].conversationId) {
    return uploads[0].conversationId;
  }
  
  return null;
};

// Function to upload pending files immediately
export const uploadPendingFiles = async (): Promise<boolean> => {
  try {
    const queue = await AsyncStorage.getItem('uploadQueue');
    if (!queue) return false;

    const uploads: UploadItem[] = JSON.parse(queue);
    const token = await AsyncStorage.getItem('auth_token');

    if (!token) {
      console.error('No auth token available for immediate upload');
      return false;
    }

    // If we have multiple uploads, try to find the primary conversation ID
    let primaryConversationId: string | null = null;
    if (uploads.length > 1) {
      primaryConversationId = await findPrimaryConversationId(uploads);
    }

    let hasChanges = false;
    let updatedUploads = [...uploads];
    
    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];
      if (upload.status === 'pending') {
        try {
          // Check if metadata file exists for this recording
          const metadataUri = `${upload.fileUri}.metadata.json`;
          let conversationId = upload.conversationId;
          
          try {
            const metadataExists = await FileSystem.getInfoAsync(metadataUri);
            if (metadataExists.exists) {
              // Read the metadata to get the actual conversation ID
              const metadata = JSON.parse(await FileSystem.readAsStringAsync(metadataUri));
              
              // If we have a primary ID and this is partner2, use the primary ID
              if (primaryConversationId && metadata && metadata.partnerPrefix === 'partner2') {
                if (conversationId !== primaryConversationId) {
                  console.log(`Correcting partner2 conversation ID from ${conversationId} to primary ID ${primaryConversationId}`);
                  conversationId = primaryConversationId;
                  updatedUploads[i] = {...updatedUploads[i], conversationId};
                  hasChanges = true;
                }
              }
              // Otherwise use the ID from metadata if available
              else if (metadata && metadata.conversationId) {
                if (conversationId !== metadata.conversationId) {
                  console.log(`Correcting conversation ID from ${conversationId} to ${metadata.conversationId}`);
                  conversationId = metadata.conversationId;
                  // Update the upload object with the correct ID
                  updatedUploads[i] = {...updatedUploads[i], conversationId};
                  hasChanges = true;
                }
              }
            }
          } catch (metadataError) {
            console.error('Error reading metadata:', metadataError);
            // Continue with the original conversation ID if metadata can't be read
          }
          
          const formData = new FormData();
          const fileName = upload.fileUri.split("/").pop() || "audio.webm";
          let mimeType = "audio/webm";
          if (fileName.endsWith('.m4a')) mimeType = "audio/x-m4a";
          else if (fileName.endsWith('.wav')) mimeType = "audio/wav";
          
          formData.append("audio", { uri: upload.fileUri, name: fileName, type: mimeType } as any);
          formData.append("conversationId", conversationId);

          console.log(`Uploading file ${fileName} for conversation ${conversationId}`);
          const response = await fetch(`${API_BASE_URL}/audio`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (response.ok) {
            updatedUploads[i] = {...updatedUploads[i], status: 'uploaded'};
            hasChanges = true;
            console.log(`Successfully uploaded ${fileName}`);
          } else {
            const errorText = await response.text();
            console.error(`Upload failed for ${fileName}: ${response.status} - ${errorText}`);
            
            // If the conversation doesn't exist, mark this upload as failed
            if (response.status === 404 && errorText.includes("Conversation not found")) {
              updatedUploads[i] = {...updatedUploads[i], status: 'failed', error: 'Conversation not found'};
              hasChanges = true;
            }
          }
        } catch (error) {
          console.error(`Upload failed for file:`, error);
        }
      }
    }

    if (hasChanges) {
      await AsyncStorage.setItem('uploadQueue', JSON.stringify(updatedUploads));
    }
    
    return hasChanges;
  } catch (error) {
    console.error('Error in uploadPendingFiles:', error);
    return false;
  }
};

// Function to clean up old failed uploads
export const cleanupOldUploads = async (): Promise<void> => {
  try {
    const queue = await AsyncStorage.getItem('uploadQueue');
    if (!queue) return;
    
    const uploads: UploadItem[] = JSON.parse(queue);
    const now = new Date();
    // Keep only: successfully uploaded, pending with < 5 retries, or added in last 24 hours
    const filteredUploads = uploads.filter((upload: UploadItem) => {
      if (upload.status === 'uploaded') return true;
      
      const addedAt = upload.addedAt ? new Date(upload.addedAt) : new Date(0);
      const isRecent = (now.getTime() - addedAt.getTime()) < 24 * 60 * 60 * 1000; // 24 hours
      
      if (upload.status === 'pending' && (upload.retryCount || 0) < 5) return true;
      if (isRecent) return true;
      
      // Log files that will be removed
      console.log(`Removing old upload from queue: ${upload.fileUri}`);
      return false;
    });
    
    if (filteredUploads.length !== uploads.length) {
      await AsyncStorage.setItem('uploadQueue', JSON.stringify(filteredUploads));
      console.log(`Cleaned up ${uploads.length - filteredUploads.length} old uploads`);
    }
  } catch (error) {
    console.error('Error cleaning up uploads:', error);
  }
};

// Call cleanup on app start and periodically
export const setupUploadQueue = async (): Promise<void> => {
  await registerUploadTask();
  await cleanupOldUploads();
  
  // Also process any pending uploads
  await uploadPendingFiles();
};

