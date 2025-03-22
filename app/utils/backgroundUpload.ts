import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from "expo-file-system";

import { getWebSocketUrl } from './websocketManager';
import { API_ENDPOINTS, API_BASE_URL } from './apiEndpoints';
import { ApiError } from '../hooks/useAPI';

// Use the same API URL as other parts of the application

// Get WebSocket URL using the same method as websocketManager
const WS_URL = getWebSocketUrl(API_BASE_URL);

const UPLOAD_TASK = 'VIBECHECK_BACKGROUND_UPLOAD';
const UPLOAD_QUEUE_KEY = 'vibecheck:uploadQueue';
const MAX_RETRIES = 3;
// const RETRY_DELAY = 5000; // 5 seconds

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

// Types for upload queue items
interface QueuedUpload {
  id: string;
  conversationId: string;
  uri: string;
  metadata?: Record<string, any>;
  retryCount: number;
  lastAttempt?: number;
  createdAt: number;
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

/**
 * Define the background task for handling uploads
 */
TaskManager.defineTask(UPLOAD_TASK, async () => {
  console.log('[BackgroundUpload] Background task started');
  
  try {
    // Get pending uploads from storage
    const queueJson = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    if (!queueJson) {
      console.log('[BackgroundUpload] No uploads pending');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Parse uploads from storage
    let uploads: QueuedUpload[] = [];
    try {
      uploads = JSON.parse(queueJson);
      console.log(`[BackgroundUpload] Found ${uploads.length} pending uploads`);
    } catch (parseError) {
      console.error('[BackgroundUpload] Error parsing upload queue:', parseError);
      // If data is corrupt, reset it
      await AsyncStorage.removeItem(UPLOAD_QUEUE_KEY);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    // Get authentication token
    let token: string | null;
    try {
      token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        console.error('[BackgroundUpload] No auth token available');
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    } catch (tokenError) {
      console.error('[BackgroundUpload] Failed to get auth token:', tokenError);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    // Track uploads that failed and need to be retried
    const remainingUploads: QueuedUpload[] = [];
    let successCount = 0;
    
    // Process each upload
    for (const upload of uploads) {
      try {
        // Create FormData for file upload
        const formData = new FormData();
        
        // Add file to form data
        formData.append('file', {
          uri: upload.uri,
          name: upload.uri.split('/').pop() || 'audio.m4a',
          type: 'audio/m4a', // Default to m4a, but could be determined from file extension
        } as any);
        
        // Add conversation ID to form data
        formData.append('conversationId', upload.conversationId);
        
        // Add any additional metadata
        if (upload.metadata) {
          Object.entries(upload.metadata).forEach(([key, value]) => {
            formData.append(key, String(value));
          });
        }

        // Log upload attempt
        console.log(`[BackgroundUpload] Uploading file for conversation ${upload.conversationId}`);
        
        // Make request to upload endpoint
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUDIO_UPLOAD}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            // Don't set Content-Type for multipart/form-data, it will be set automatically
          },
          body: formData,
        });

        // Check response status
        if (!response.ok) {
          // Parse error response
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || 'Unknown error' };
          }
          
          // Handle different error types
          if (response.status === 401 || response.status === 403) {
            // Auth errors - can't retry with same token
            console.error('[BackgroundUpload] Authentication error:', errorData.error);
            throw new ApiError('Authentication failed', {
              isAuthError: true,
              status: response.status
            });
          } else if (response.status === 429) {
            // Rate limit - add to retry queue with backoff
            console.warn('[BackgroundUpload] Rate limit hit, will retry later');
            upload.retryCount++;
            upload.lastAttempt = Date.now();
            remainingUploads.push(upload);
            continue;
          } else if (response.status >= 500) {
            // Server error - retry if under max retries
            console.error('[BackgroundUpload] Server error:', errorData.error);
            if (upload.retryCount < MAX_RETRIES) {
              upload.retryCount++;
              upload.lastAttempt = Date.now();
              remainingUploads.push(upload);
            }
            continue;
          } else {
            // Other client errors - don't retry
            console.error('[BackgroundUpload] Upload failed:', errorData.error);
            throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
          }
        }

        // Success! 
        console.log(`[BackgroundUpload] Successfully uploaded file for conversation ${upload.conversationId}`);
        successCount++;
        
        // Send success notification if needed
        // This could update a local storage record, trigger a notification, etc.
        
      } catch (uploadError) {
        console.error(`[BackgroundUpload] Error uploading file: ${uploadError}`);
        
        // Only retry if under max retries and not an auth error
        const isAuthError = uploadError instanceof ApiError && uploadError.isAuthError;
        
        if (!isAuthError && upload.retryCount < MAX_RETRIES) {
          upload.retryCount++;
          upload.lastAttempt = Date.now();
          remainingUploads.push(upload);
        }
      }
    }

    // Update queue with remaining uploads
    if (remainingUploads.length > 0) {
      await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(remainingUploads));
      console.log(`[BackgroundUpload] ${remainingUploads.length} uploads pending for retry`);
    } else {
      await AsyncStorage.removeItem(UPLOAD_QUEUE_KEY);
      console.log('[BackgroundUpload] All uploads completed successfully');
    }

    // Return appropriate result
    if (successCount > 0) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } else if (remainingUploads.length > 0) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    } else {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    
  } catch (error) {
    console.error('[BackgroundUpload] Background task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Initialize background fetch for uploads
 */
export const initBackgroundUpload = (): void => {
  try {
    // Define the task first using TaskManager if not already defined
    if (!TaskManager.isTaskDefined(UPLOAD_TASK)) {
      TaskManager.defineTask(UPLOAD_TASK, async () => {
        console.log('[BackgroundUpload] Background task executed');
        
        try {
          await TaskManager.defineTask(UPLOAD_TASK, async () => {
            // The task implementation is already defined separately above
            return BackgroundFetch.BackgroundFetchResult.NoData;
          });
        } catch (taskError) {
          console.error('[BackgroundUpload] Task execution failed:', taskError);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
        
        return BackgroundFetch.BackgroundFetchResult.NewData;
      });
    }
    
    // Register the background fetch task
    BackgroundFetch.registerTaskAsync(UPLOAD_TASK, {
      minimumInterval: 15 * 60, // 15 minutes in seconds
      stopOnTerminate: false,
      startOnBoot: true,
    }).then(() => {
      console.log('[BackgroundUpload] Background upload service initialized');
    }).catch((error: Error) => {
      console.error('[BackgroundUpload] Background fetch failed to start:', error);
    });
  } catch (error) {
    console.error('[BackgroundUpload] Failed to initialize background upload:', error);
  }
};

/**
 * Add a file to the upload queue
 */
export const addToUploadQueue = async (
  conversationId: string,
  uri: string,
  metadata?: Record<string, any>
): Promise<string> => {
  try {
    // Generate a unique ID for this upload
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the upload object
    const uploadItem: QueuedUpload = {
      id: uploadId,
      conversationId,
      uri,
      metadata,
      retryCount: 0,
      createdAt: Date.now(),
    };
    
    // Get existing queue
    const queueJson = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    const queue: QueuedUpload[] = queueJson ? JSON.parse(queueJson) : [];
    
    // Add new upload to queue
    queue.push(uploadItem);
    
    // Save updated queue
    await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue));
    
    console.log(`[BackgroundUpload] Added file to upload queue for conversation ${conversationId}`);
    
    // Trigger a background fetch to process the queue
    try {
      await BackgroundFetch.registerTaskAsync(UPLOAD_TASK, {
        minimumInterval: 1, // Minimum interval in seconds
        stopOnTerminate: false,
      });
    } catch (error: unknown) {
      console.warn('[BackgroundUpload] Failed to schedule immediate task:', error);
    }
    
    return uploadId;
  } catch (error) {
    console.error('[BackgroundUpload] Failed to add to upload queue:', error);
    throw new Error('Failed to queue upload');
  }
};

/**
 * Get the current upload queue status
 */
export const getUploadQueueStatus = async (): Promise<{
  pendingCount: number;
  uploads: QueuedUpload[];
}> => {
  try {
    const queueJson = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
    const uploads: QueuedUpload[] = queueJson ? JSON.parse(queueJson) : [];
    
    return {
      pendingCount: uploads.length,
      uploads,
    };
  } catch (error) {
    console.error('[BackgroundUpload] Failed to get upload queue status:', error);
    return {
      pendingCount: 0,
      uploads: [],
    };
  }
};

/**
 * Clear the upload queue
 */
export const clearUploadQueue = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(UPLOAD_QUEUE_KEY);
    console.log('[BackgroundUpload] Upload queue cleared');
  } catch (error) {
    console.error('[BackgroundUpload] Failed to clear upload queue:', error);
    throw new Error('Failed to clear upload queue');
  }
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
  await initBackgroundUpload();
  await cleanupOldUploads();
  
  // Also process any pending uploads
  await uploadPendingFiles();
};

