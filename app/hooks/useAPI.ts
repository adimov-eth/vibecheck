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

// Custom error class for error categorization
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
      
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(`Authentication failed: ${response.statusText}`, {
          status: response.status,
          isAuthError: true,
          code: 'AUTH_FAILED'
        });
      } else if (response.status === 429) {
        throw new ApiError('Rate limit exceeded: Please try again later', {
          status: response.status,
          isRateLimitError: true,
          code: 'RATE_LIMIT_EXCEEDED'
        });
      } else if (response.status >= 500) {
        throw new ApiError(`Server error: ${response.statusText}`, {
          status: response.status,
          isServerError: true,
          code: 'SERVER_ERROR'
        });
      } else if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiError(errorData.error || `Request failed with status ${response.status}`, {
          status: response.status,
          code: errorData.code || 'REQUEST_FAILED'
        });
      }
      
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isRateLimitError && retries < MAX_RETRIES) {
          const waitTime = 1000 * Math.pow(2, retries);
          console.log(`Rate limit hit, retrying in ${waitTime/1000}s (${retries + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return fetchWithRetry(url, options, retries + 1);
        }
        
        if (error.isAuthError && retries > 0) {
          console.error('Authentication error, not retrying:', error.message);
          throw error;
        }
        
        if (error.isNetworkError && retries < MAX_RETRIES) {
          const waitTime = RETRY_DELAY * (retries + 1);
          console.log(`Network error, retrying in ${waitTime/1000}s (${retries + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return fetchWithRetry(url, options, retries + 1);
        }
        
        throw error;
      }
      
      if (error instanceof TypeError && 
          (error.message.includes('Network request failed') || 
           error.message.includes('network error'))) {
        throw new ApiError('Network connection error. Please check your internet connection.', {
          isNetworkError: true,
          code: 'NETWORK_ERROR'
        });
      }
      
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
    const existingInstance = activePollingMap.get(conversationId);
    if (existingInstance) {
      console.log(`Reusing existing polling for conversation: ${conversationId}`);
      return new Promise<AnalysisResponse>((_, reject) => {
        reject(new Error('Polling already in progress for this conversation'));
      });
    }

    console.log(`Starting new polling for conversation: ${conversationId}`);
    
    return new Promise<AnalysisResponse>((resolve, reject) => {
      const intervalRef = { current: null as NodeJS.Timeout | null };
      const pollCount = { current: 0 };
      const maxAttempts = 60;
      let hasResolved = false;
      
      let lastProgressValue = 0;
      
      const cleanup = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        activePollingMap.delete(conversationId);
      };
      
      activePollingMap.set(conversationId, {
        intervalId: null,
        cancelFn: () => {
          hasResolved = true;
          cleanup();
          reject(new Error('Polling was cancelled'));
        }
      });
      
      const checkResult = async () => {
        try {
          pollCount.current += 1;
          
          if (pollCount.current % 5 === 0) {
            console.log(`Polling for results (attempt ${pollCount.current}/${maxAttempts})...`);
          }
          
          const statusResponse = await getConversationStatus(conversationId);
          
          if (statusResponse.progress && onProgress && statusResponse.progress > lastProgressValue) {
            lastProgressValue = statusResponse.progress;
            onProgress(statusResponse.progress);
          }
          
          if (statusResponse.status === 'completed') {
            try {
              const result = await getConversationResult(conversationId);
              cleanup();
              if (onProgress) onProgress(100);
              hasResolved = true;
              resolve(result);
            } catch (resultError) {
              console.error('Error fetching completed result:', resultError);
              cleanup();
              hasResolved = true;
              reject(resultError);
            }
          } else if (statusResponse.status === 'error') {
            cleanup();
            hasResolved = true;
            reject(new Error(statusResponse.error || 'Processing failed'));
          } else if (pollCount.current >= maxAttempts) {
            cleanup();
            hasResolved = true;
            reject(new Error('Polling timed out after maximum attempts'));
          }
        } catch (error) {
          console.error(`Error polling for results (attempt ${pollCount.current}/${maxAttempts}):`, error);
          if (pollCount.current >= maxAttempts) {
            cleanup();
            if (!hasResolved) {
              hasResolved = true;
              reject(error);
            }
          }
        }
      };
      
      intervalRef.current = setInterval(checkResult, 3000);
      const instanceData = activePollingMap.get(conversationId);
      if (instanceData) instanceData.intervalId = intervalRef.current;
      
      checkResult().catch(error => console.warn('Initial status check failed:', error));
    });
  }, [getConversationStatus, getConversationResult]);

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
        subscription: { type: null, expiresDate: null },
      };
    }
  }, [fetchWithRetry]);

  const getSubscriptionStatus = useCallback(async (): Promise<SubscriptionStatus> => {
    try {
      const token = await getFreshToken();
      if (!token) throw new Error('Authentication failed: Invalid token');
      console.log('Checking subscription status with fresh token');
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.SUBSCRIPTION_STATUS}`, { method: 'GET' }, 0);
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
        subscription: { type: null, expiresDate: null },
      };
    }
  }, [fetchWithRetry, getFreshToken]);

  const getUserUsageStats = useCallback(async (): Promise<UsageStats> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.USAGE_STATS}`, { method: 'GET' });
      const result = await response.json() as UsageResponse;
      return {
        ...result.usage,
        resetDate: result.usage.resetDate ? new Date(result.usage.resetDate) : null
      };
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      return {
        currentUsage: 0,
        limit: 0,
        isSubscribed: false,
        remainingConversations: 0,
        resetDate: null
      };
    }
  }, [fetchWithRetry]);

  const getUserProfile = useCallback(async (): Promise<UserProfile> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}${API_ENDPOINTS.USER_PROFILE}`, { method: 'GET' });
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
    const instance = activePollingMap.get(conversationId);
    if (instance) {
      if (instance.intervalId) clearInterval(instance.intervalId);
      instance.cancelFn();
      activePollingMap.delete(conversationId);
      console.log(`Cancelled polling for conversation: ${conversationId}`);
    }
  } else {
    activePollingMap.forEach((instance, id) => {
      if (instance.intervalId) clearInterval(instance.intervalId);
      instance.cancelFn();
      console.log(`Cancelled polling for conversation: ${id}`);
    });
    activePollingMap.clear();
  }
}