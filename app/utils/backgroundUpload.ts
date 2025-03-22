import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import * as FileSystem from "expo-file-system";

import Constants from 'expo-constants';
import { getWebSocketUrl } from './websocketManager';

// Use the same API URL as other parts of the application
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || "https://api.vibecheck.app";

// Get WebSocket URL using the same method as websocketManager
const WS_URL = getWebSocketUrl(API_BASE_URL);

const UPLOAD_TASK = 'upload-task';

// Define upload item interface
interface UploadItem {
  conversationId: string;
  fileUri: string;
  status: 'pending' | 'uploaded' | 'failed' | 'retrying';
  retryCount?: number;
  addedAt?: string;
  lastRetry?: string;
  error?: string;
  nextRetry?: number; // Timestamp for next retry
  progress?: number; // Upload progress percentage (0-100)
}

/**
 * Notify server about upload status via WebSocket
 * This is a lightweight implementation that doesn't maintain a persistent connection
 */
const notifyUploadStatus = async (
  conversationId: string, 
  status: 'started' | 'progress' | 'completed' | 'failed',
  details: any = {}
) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;
    
    // Create a temporary WebSocket connection for the notification
    const ws = new WebSocket(`${WS_URL}`);
    
    // Track if we've received acknowledgment
    let messagesAcknowledged = 0;
    const expectedAcknowledgments = 2; // For subscribe and status message
    let connectionClosed = false;
    
    // Create promise to track completion
    return new Promise<void>((resolve, reject) => {
      // Set maximum timeout for the entire operation
      const maxTimeout = setTimeout(() => {
        if (!connectionClosed) {
          console.log('WebSocket notification timed out, closing connection');
          connectionClosed = true;
          ws.close();
          resolve(); // Resolve anyway to not block the upload process
        }
      }, 5000); // 5 second maximum timeout
      
      // Handle server responses
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Check if this is an acknowledgment message
          if (data.type === 'ack' || data.type === 'subscription_success') {
            messagesAcknowledged++;
            
            // If we've received all expected acknowledgments, close the connection
            if (messagesAcknowledged >= expectedAcknowledgments && !connectionClosed) {
              console.log('WebSocket notification complete, closing connection');
              connectionClosed = true;
              clearTimeout(maxTimeout);
              ws.close();
              resolve();
            }
          }
        } catch (error) {
          console.warn('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onopen = () => {
        // Send authentication message first
        ws.send(JSON.stringify({
          type: 'authenticate',
          token: token
        }));
        
        // Then send subscription message
        ws.send(JSON.stringify({
          type: 'subscribe',
          topic: `conversation:${conversationId}`
        }));
        
        // Then send the upload status message
        ws.send(JSON.stringify({
          type: 'upload_status',
          topic: `conversation:${conversationId}`,
          payload: {
            conversationId,
            status,
            timestamp: new Date().toISOString(),
            ...details
          }
        }));
      };
      
      // Handle errors
      ws.onerror = (error) => {
        console.error('WebSocket notification error:', error);
        if (!connectionClosed) {
          connectionClosed = true;
          clearTimeout(maxTimeout);
          ws.close();
          resolve(); // Resolve anyway to not block the upload process
        }
      };
      
      ws.onclose = () => {
        if (!connectionClosed) {
          connectionClosed = true;
          clearTimeout(maxTimeout);
          resolve();
        }
      };
    });
  } catch (error) {
    console.error('Failed to send WebSocket notification:', error);
  }
}

// Helper function to safely get file size
const getFileSize = async (fileUri: string): Promise<number> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    // Type assertion for when file exists and has size property
    if (fileInfo.exists && 'size' in fileInfo) {
      return fileInfo.size;
    }
    return 0;
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
};

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
    const now = Date.now();
    
    // First pass: process retrying uploads that are ready for retry
    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];
      
      // Skip uploads that are not in retrying state or not ready for retry
      if (upload.status !== 'retrying' || (upload.nextRetry && upload.nextRetry > now)) {
        continue;
      }
      
      updatedUploads[i] = {
        ...updatedUploads[i],
        status: 'pending',
        retryCount: (upload.retryCount || 0) + 1,
        lastRetry: new Date().toISOString()
      };
      hasChanges = true;
    }
    
    // Second pass: process pending uploads
    for (let i = 0; i < updatedUploads.length; i++) {
      const upload = updatedUploads[i];
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
          
          // Send WebSocket notification that upload is starting
          await notifyUploadStatus(conversationId, 'started', { 
            fileName, 
            fileSize: await getFileSize(upload.fileUri)
          });
          
          // Use XMLHttpRequest to track progress
          const xhr = new XMLHttpRequest();
          let progressReported = 0;
          
          // Create a promise that resolves when the upload is complete
          const uploadPromise = new Promise<Response>((resolve, reject) => {
            xhr.open('POST', `${API_BASE_URL}/audio`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            // Track upload progress
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                
                // Only report progress at 10% intervals to reduce WebSocket traffic
                if (progress >= progressReported + 10 || progress === 100) {
                  progressReported = progress;
                  
                  // Update progress in the upload item
                  updatedUploads[i] = {...updatedUploads[i], progress};
                  hasChanges = true;
                  
                  // Send WebSocket notification of progress
                  notifyUploadStatus(conversationId, 'progress', { progress });
                  console.log(`Upload progress: ${progress}%`);
                }
              }
            };
            
            // Handle completion
            xhr.onload = () => {
              const response = {
                ok: xhr.status >= 200 && xhr.status < 300,
                status: xhr.status,
                text: () => Promise.resolve(xhr.responseText),
                json: () => Promise.resolve(JSON.parse(xhr.responseText))
              } as Response;
              
              resolve(response);
            };
            
            // Handle errors
            xhr.onerror = () => {
              reject(new Error('Network error occurred'));
            };
            
            xhr.ontimeout = () => {
              reject(new Error('Request timed out'));
            };
            
            // Send the form data
            xhr.send(formData);
          });
          
          const response = await uploadPromise;

          if (response.ok) {
            updatedUploads[i] = {...updatedUploads[i], status: 'uploaded', progress: 100};
            hasChanges = true;
            console.log(`Successfully uploaded ${fileName}`);
            
            // Send WebSocket notification of successful upload
            await notifyUploadStatus(conversationId, 'completed', { 
              fileName,
              fileSize: await getFileSize(upload.fileUri)
            });
          } else {
            const errorText = await response.text();
            console.error(`Upload failed for ${fileName}: ${response.status} - ${errorText}`);
            
            // Send WebSocket notification of failed upload
            await notifyUploadStatus(conversationId, 'failed', { 
              fileName,
              error: errorText,
              status: response.status
            });
            
            // Handle race condition where conversation isn't created yet
            if (response.status === 404 && errorText.includes("Conversation not found")) {
              const retryCount = (upload.retryCount || 0) + 1;
              const retryDelay = Math.min(30000, 1000 * Math.pow(2, retryCount)); // Exponential backoff capped at 30s
              console.log(`Request failed, retrying (${retryCount}/3) in ${retryDelay/1000} seconds...`);
              
              // If we've tried too many times, mark as failed
              if (retryCount > 3) {
                updatedUploads[i] = {
                  ...updatedUploads[i], 
                  status: 'failed', 
                  error: 'Conversation not found after multiple retries',
                  retryCount
                };
              } else {
                // Otherwise, schedule a retry
                updatedUploads[i] = {
                  ...updatedUploads[i], 
                  status: 'retrying', 
                  error: 'Conversation not found',
                  retryCount,
                  nextRetry: now + retryDelay
                };
              }
              hasChanges = true;
            }
            // Handle auth errors
            else if (response.status === 401 || response.status === 403) {
              console.error('Auth token invalid, redirecting to sign-in');
              updatedUploads[i] = {
                ...updatedUploads[i], 
                status: 'failed', 
                error: 'Authentication error'
              };
              hasChanges = true;
            }
            // Handle other errors
            else {
              updatedUploads[i] = {
                ...updatedUploads[i], 
                status: 'failed', 
                error: `HTTP ${response.status}: ${errorText}`
              };
              hasChanges = true;
            }
          }
        } catch (error) {
          console.error(`Upload failed for file:`, error);
          
          // Apply retry mechanism for network errors
          const retryCount = (upload.retryCount || 0) + 1;
          const retryDelay = Math.min(30000, 1000 * Math.pow(2, retryCount)); // Exponential backoff capped at 30s
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check if this is a network-related error
          const isNetworkError = 
            errorMessage.includes('Network error') || 
            errorMessage.includes('timeout') || 
            errorMessage.includes('connection') ||
            errorMessage.includes('ECONNREFUSED') || 
            errorMessage.includes('ETIMEDOUT');
          
          // If it's a network error and we haven't exceeded retry limit
          if (isNetworkError && retryCount <= 3) {
            console.log(`Network error, retrying (${retryCount}/3) in ${retryDelay/1000} seconds...`);
            updatedUploads[i] = {
              ...updatedUploads[i], 
              status: 'retrying', 
              error: `Network error: ${errorMessage}`,
              retryCount,
              nextRetry: now + retryDelay
            };
            
            // Send WebSocket notification of failed upload with retry planned
            if (upload.conversationId) {
              notifyUploadStatus(upload.conversationId, 'failed', { 
                fileName: upload.fileUri.split("/").pop() || "audio.webm",
                error: errorMessage,
                willRetry: true,
                retryCount,
                nextRetryIn: retryDelay / 1000
              }).catch(e => console.error('Failed to send retry notification:', e));
            }
          } else {
            // If it's not a network error or we've exceeded retry limit
            updatedUploads[i] = {
              ...updatedUploads[i], 
              status: 'failed', 
              error: errorMessage,
              retryCount
            };
            
            // Send WebSocket notification of permanent failure
            if (upload.conversationId) {
              notifyUploadStatus(upload.conversationId, 'failed', { 
                fileName: upload.fileUri.split("/").pop() || "audio.webm",
                error: errorMessage,
                willRetry: false
              }).catch(e => console.error('Failed to send failure notification:', e));
            }
          }
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      await AsyncStorage.setItem('uploadQueue', JSON.stringify(updatedUploads));
    }
    
    // Schedule another run if we have any retrying uploads
    const hasRetrying = updatedUploads.some(u => u.status === 'retrying');
    if (hasRetrying) {
      const soonestRetry = Math.min(...updatedUploads
        .filter(u => u.status === 'retrying' && u.nextRetry)
        .map(u => u.nextRetry || Infinity));
      
      const delay = Math.max(1000, soonestRetry - now);
      setTimeout(() => uploadPendingFiles(), delay);
    }
    
    console.log("All uploads complete");
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

