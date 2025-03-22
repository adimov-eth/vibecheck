// utils/useApi.ts
import { useCallback } from 'react';
import { useAuthToken } from './useAuthToken';
import { UserProfile, UserProfileResponse } from '../types/user';
import { ConversationStatus, AnalysisResponse } from '../types/api';
import { API_ENDPOINTS, API_BASE_URL } from '../utils/apiEndpoints';

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Global polling tracker to prevent duplicate polling instances
const activePollingMap = new Map<string, {
  intervalId: NodeJS.Timeout | null;
  cancelFn: () => void;
}>();

export interface SubscriptionStatus {
  isSubscribed: boolean;
  subscription: {
    type: string | null;
    expiresDate: Date | null;
  };
}

export interface UsageStats {
  currentUsage: number;
  limit: number;
  isSubscribed: boolean;
  remainingConversations: number;
  resetDate: Date | null;
}

export interface UsageResponse {
  usage: UsageStats;
}

export interface ApiHook {
  createConversation: (id: string, mode: string, recordingType: 'separate' | 'live') => Promise<string>;
  getConversationStatus: (conversationId: string) => Promise<ConversationStatus>;
  getConversationResult: (conversationId: string) => Promise<AnalysisResponse>;
  pollForResult: (conversationId: string, onProgress?: (progress: number) => void) => Promise<AnalysisResponse>;
  verifySubscriptionReceipt: (receiptData: string) => Promise<SubscriptionStatus>;
  getSubscriptionStatus: () => Promise<SubscriptionStatus>;
  getUserUsageStats: () => Promise<UsageStats>;
  getUserProfile: () => Promise<UserProfile>;
}

// Custom error class to maintain error categorization
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly isAuthError: boolean;
  readonly isRateLimitError: boolean;
  readonly isNetworkError: boolean;
  readonly isServerError: boolean;

  constructor(message: string, options: {
    status?: number;
    code?: string;
    isAuthError?: boolean;
    isRateLimitError?: boolean;
    isNetworkError?: boolean;
    isServerError?: boolean;
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.isAuthError = options.isAuthError || false;
    this.isRateLimitError = options.isRateLimitError || false;
    this.isNetworkError = options.isNetworkError || false;
    this.isServerError = options.isServerError || false;
  }
}

export function useApi(): ApiHook {
  const { getFreshToken } = useAuthToken();

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit, retries = 0): Promise<Response> => {
    try {
      const token = await getFreshToken();
      
      if (!token) {
        throw new ApiError('Authentication failed: Invalid token', {
          isAuthError: true,
          code: 'AUTH_INVALID_TOKEN'
        });
      }
      
      const endpoint = url.split('/').slice(-2).join('/');
      console.log(`API request to: ${endpoint}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      // Handle specific HTTP status codes
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(`Authentication failed: ${response.statusText}`, {
          status: response.status,
          isAuthError: true,
          code: 'AUTH_FAILED'
        });
      } else if (response.status === 429) {
        // Rate limit exceeded
        // Parse the retry-after header if available
        
        throw new ApiError('Rate limit exceeded: Please try again later', {
          status: response.status,
          isRateLimitError: true,
          code: 'RATE_LIMIT_EXCEEDED'
        });
      } else if (response.status >= 500) {
        // Server errors
        throw new ApiError(`Server error: ${response.statusText}`, {
          status: response.status,
          isServerError: true,
          code: 'SERVER_ERROR'
        });
      } else if (!response.ok) {
        // Other client errors
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiError(errorData.error || `Request failed with status ${response.status}`, {
          status: response.status,
          code: errorData.code || 'REQUEST_FAILED'
        });
      }
      
      return response;
    } catch (error) {
      // If it's already an ApiError, don't wrap it again
      if (error instanceof ApiError) {
        // Handle rate limit errors with appropriate backoff
        if (error.isRateLimitError && retries < MAX_RETRIES) {
          const waitTime = 1000 * Math.pow(2, retries); // Exponential backoff
          console.log(`Rate limit hit, retrying in ${waitTime/1000}s (${retries + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return fetchWithRetry(url, options, retries + 1);
        }
        
        // Don't retry auth errors to avoid spam
        if (error.isAuthError && retries > 0) {
          console.error('Authentication error, not retrying:', error.message);
          throw error;
        }
        
        // Handle network errors with retries
        if (error.isNetworkError && retries < MAX_RETRIES) {
          const waitTime = RETRY_DELAY * (retries + 1);
          console.log(`Network error, retrying in ${waitTime/1000}s (${retries + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return fetchWithRetry(url, options, retries + 1);
        }
        
        throw error;
      }
      
      // Handle fetch network errors (e.g., no internet connection)
      if (error instanceof TypeError && 
          (error.message.includes('Network request failed') || 
           error.message.includes('network error'))) {
        
        throw new ApiError('Network connection error. Please check your internet connection.', {
          isNetworkError: true,
          code: 'NETWORK_ERROR'
        });
      }
      
      // For subscription status endpoint, use a longer delay between retries
      const isSubscriptionEndpoint = url.includes('/subscriptions/status');
      const delayTime = isSubscriptionEndpoint ? RETRY_DELAY * 2 : RETRY_DELAY;
      
      if (retries < MAX_RETRIES) {
        console.log(`Request failed, retrying (${retries + 1}/${MAX_RETRIES}) in ${delayTime / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayTime));
        return fetchWithRetry(url, options, retries + 1);
      }
      
      console.error('Request failed after retries:', error);
      throw new ApiError('Request failed after maximum retries', {
        code: 'MAX_RETRIES_EXCEEDED'
      });
    }
  }, [getFreshToken]);

  const createConversation = useCallback(async (id: string, mode: string, recordingType: 'separate' | 'live') => {
    const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.CONVERSATIONS}`, {
      method: 'POST',
      body: JSON.stringify({ id, mode, recordingType }),
    });
    const data = await response.json();
    if (data.note) console.log('Server note:', data.note);
    return data.conversationId as string;
  }, [fetchWithRetry]);

  const getConversationStatus = useCallback(async (conversationId: string) => {
    const response = await fetchWithRetry(
      `${API_BASE_URL}${API_ENDPOINTS.CONVERSATION_STATUS(conversationId)}`,
      { method: 'GET' }
    );
    return await response.json() as ConversationStatus;
  }, [fetchWithRetry]);

  const getConversationResult = useCallback(async (conversationId: string) => {
    const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.CONVERSATION_RESULT(conversationId)}`, {
      method: 'GET',
    });
    return await response.json() as AnalysisResponse;
  }, [fetchWithRetry]);

  const pollForResult = useCallback((conversationId: string, onProgress?: (progress: number) => void) => {
    // Check for existing polling instance and return the same promise
    const existingInstance = activePollingMap.get(conversationId);
    if (existingInstance) {
      console.log(`Reusing existing polling for conversation: ${conversationId}`);
      return new Promise<AnalysisResponse>((_, reject) => {
        // Return already-in-progress polling with a way to cancel
        reject(new Error('Polling already in progress for this conversation'));
      });
    }

    console.log(`Starting new polling for conversation: ${conversationId}`);
    
    return new Promise<AnalysisResponse>((resolve, reject) => {
      const intervalRef = { current: null as NodeJS.Timeout | null };
      const pollCount = { current: 0 };
      const maxAttempts = 60; // Maximum polling attempts (3 minutes at 3s intervals)
      let hasResolved = false;
      
      // Progress tracking
      let lastProgressValue = 0;
      
      // Function to clean up polling resources
      const cleanup = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        activePollingMap.delete(conversationId);
      };
      
      // Store in the global map
      activePollingMap.set(conversationId, {
        intervalId: null, // Will be set below
        cancelFn: () => {
          hasResolved = true;
          cleanup();
          reject(new Error('Polling was cancelled'));
        }
      });
      
      const checkResult = async () => {
        try {
          pollCount.current += 1;
          
          // Log every 5 attempts to reduce console noise
          if (pollCount.current % 5 === 0) {
            console.log(`Polling for results (attempt ${pollCount.current}/${maxAttempts})...`);
          }
          
          // Get conversation status
          const statusResponse = await getConversationStatus(conversationId);
          
          // Update progress
          if (statusResponse.progress && onProgress && statusResponse.progress > lastProgressValue) {
            lastProgressValue = statusResponse.progress;
            onProgress(statusResponse.progress);
          }
          
          // Check status
          if (statusResponse.status === 'completed') {
            try {
              const result = await getConversationResult(conversationId);
              
              // Clean up resources
              cleanup();
              
              // Mark as final progress
              if (onProgress) {
                onProgress(100);
              }
              
              hasResolved = true;
              resolve(result);
            } catch (resultError) {
              console.error('Error fetching completed result:', resultError);
              cleanup();
              hasResolved = true;
              reject(resultError);
            }
          } else if (statusResponse.status === 'error') {
            // Handle error status from the API
            cleanup();
            hasResolved = true;
            reject(new Error(statusResponse.error || 'Processing failed'));
          } else if (pollCount.current >= maxAttempts) {
            // Handle timeout after max attempts
            cleanup();
            hasResolved = true;
            reject(new Error('Polling timed out after maximum attempts'));
          }
        } catch (error) {
          console.error(`Error polling for results (attempt ${pollCount.current}/${maxAttempts}):`, error);
          
          // Only reject if we've tried at least 10 times or after all attempts
          if (pollCount.current >= maxAttempts) {
            cleanup();
            if (!hasResolved) {
              hasResolved = true;
              reject(error);
            }
          }
        }
      };
      
      // Start polling
      intervalRef.current = setInterval(checkResult, 3000);
      
      // Update the interval ID in the global map
      const instanceData = activePollingMap.get(conversationId);
      if (instanceData) {
        instanceData.intervalId = intervalRef.current;
      }
      
      // Initial check right away
      checkResult().catch(error => {
        console.warn('Initial status check failed:', error);
      });
    });
  }, [getConversationStatus, getConversationResult]);

  // Verify a subscription receipt with the server
  const verifySubscriptionReceipt = useCallback(async (receiptData: string): Promise<SubscriptionStatus> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.SUBSCRIPTION_VERIFY}`, {
        method: 'POST',
        body: JSON.stringify({ receiptData }),
      });
      
      const result = await response.json();
      
      return {
        isSubscribed: result.success,
        subscription: {
          type: result.subscription?.type || null,
          expiresDate: result.subscription?.expiresDate ? new Date(result.subscription.expiresDate) : null,
        },
      };
    } catch (error) {
      console.error('Receipt verification error:', error);
      return {
        isSubscribed: false,
        subscription: {
          type: null,
          expiresDate: null,
        },
      };
    }
  }, [fetchWithRetry]);

  // Get current subscription status
  const getSubscriptionStatus = useCallback(async (): Promise<SubscriptionStatus> => {
    try {
      // Get a fresh token before making the subscription status request
      // This helps ensure the token is valid before checking subscription
      const token = await getFreshToken();
      
      if (!token) {
        console.error('Failed to get valid token for subscription check');
        throw new Error('Authentication failed: Invalid token');
      }
      
      console.log('Checking subscription status with fresh token');
      
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.SUBSCRIPTION_STATUS}`, {
        method: 'GET',
      }, 0); // Start with 0 retries to get a fresh attempt
      
      const result = await response.json();
      
      return {
        isSubscribed: result.isSubscribed,
        subscription: {
          type: result.subscription?.type || null,
          expiresDate: result.subscription?.expiresDate ? new Date(result.subscription.expiresDate) : null,
        },
      };
    } catch (error) {
      console.error('Subscription status error:', error);
      return {
        isSubscribed: false,
        subscription: {
          type: null,
          expiresDate: null,
        },
      };
    }
  }, [fetchWithRetry, getFreshToken]);

  // Get user's usage statistics
  const getUserUsageStats = useCallback(async (): Promise<UsageStats> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.USAGE_STATS}`, {
        method: 'GET',
      });
      
      const result = await response.json() as UsageResponse;
      
      // Transform the resetDate from string to Date object if it exists
      return {
        ...result.usage,
        resetDate: result.usage.resetDate ? new Date(result.usage.resetDate) : null
      };
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      // Return default values in case of error
      return {
        currentUsage: 0,
        limit: 0,
        isSubscribed: false,
        remainingConversations: 0,
        resetDate: null
      };
    }
  }, [fetchWithRetry]);

  // Get user profile
  const getUserProfile = useCallback(async (): Promise<UserProfile> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.USER_PROFILE}`, {
        method: 'GET',
      });
      
      const result = await response.json() as UserProfileResponse;
      return result.user;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }, [fetchWithRetry]);

  return {
    createConversation,
    getConversationStatus,
    getConversationResult,
    pollForResult,
    verifySubscriptionReceipt,
    getSubscriptionStatus,
    getUserUsageStats,
    getUserProfile,
  };
}

export function cancelAllPolling(conversationId?: string): void {
  if (conversationId) {
    // Cancel specific polling instance
    const instance = activePollingMap.get(conversationId);
    if (instance) {
      if (instance.intervalId) {
        clearInterval(instance.intervalId);
      }
      instance.cancelFn();
      activePollingMap.delete(conversationId);
      console.log(`Cancelled polling for conversation: ${conversationId}`);
    }
  } else {
    // Cancel all polling instances
    activePollingMap.forEach((instance, id) => {
      if (instance.intervalId) {
        clearInterval(instance.intervalId);
      }
      instance.cancelFn();
      console.log(`Cancelled polling for conversation: ${id}`);
    });
    activePollingMap.clear();
  }
}