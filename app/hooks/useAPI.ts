// utils/useApi.ts
import { useCallback, useRef } from 'react';
import { useAuthToken } from './useAuthToken';
import { UserProfile, UserProfileResponse } from '../types/user';

const API_BASE_URL = 'https://v.bkk.lol'; // Replace with your server URL
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export interface AnalysisResponse {
  summary: string;
  recommendations: string[];
  highlights: {
    partner1: string[];
    partner2: string[];
  };
}

export interface ConversationStatus {
  status: string;
  id: string;
}

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
  pollForResult: (conversationId: string, onComplete: (data: AnalysisResponse) => void) => () => void;
  verifySubscriptionReceipt: (receiptData: string) => Promise<SubscriptionStatus>;
  getSubscriptionStatus: () => Promise<SubscriptionStatus>;
  getUserUsageStats: () => Promise<UsageStats>;
  getUserProfile: () => Promise<UserProfile>;
}

export function useApi(): ApiHook {
  const { getFreshToken } = useAuthToken();

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit, retries = 0): Promise<Response> => {
    try {
      const token = await getFreshToken();
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Request failed');
      }
      return response;
    } catch (error) {
      if (retries < MAX_RETRIES) {
        console.log(`Request failed, retrying (${retries + 1}/${MAX_RETRIES}) in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, options, retries + 1);
      }
      console.error('Request failed after retries:', error);
      throw error;
    }
  }, [getFreshToken]);

  const createConversation = useCallback(async (id: string, mode: string, recordingType: 'separate' | 'live') => {
    const response = await fetchWithRetry(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ id, mode, recordingType }),
    });
    const data = await response.json();
    if (data.note) console.log('Server note:', data.note);
    return data.conversationId as string;
  }, [fetchWithRetry]);

  const getConversationStatus = useCallback(async (conversationId: string) => {
    const response = await fetchWithRetry(`${API_BASE_URL}/conversations/${conversationId}`, {
      method: 'GET',
    });
    return await response.json() as ConversationStatus;
  }, [fetchWithRetry]);

  const getConversationResult = useCallback(async (conversationId: string) => {
    const response = await fetchWithRetry(`${API_BASE_URL}/conversations/${conversationId}/result`, {
      method: 'GET',
    });
    return await response.json() as AnalysisResponse;
  }, [fetchWithRetry]);

  const pollForResult = useCallback((conversationId: string, onComplete: (data: AnalysisResponse) => void) => {
    const intervalRef = { current: null as NodeJS.Timeout | null };
    const pollCount = { current: 0 };
    
    const checkResult = async () => {
      try {
        const { status } = await getConversationStatus(conversationId);
        
        pollCount.current += 1;
        if (pollCount.current % 5 === 0) {
          console.log(`Polling for results (attempt ${pollCount.current})...`);
        }
        
        if (status === 'completed') {
          const result = await getConversationResult(conversationId);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          onComplete(result);
        }
      } catch (error) {
        console.error('Error polling for results:', error);
      }
    };
    
    intervalRef.current = setInterval(checkResult, 3000);
    
    // Return cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [getConversationStatus, getConversationResult]);

  // Verify a subscription receipt with the server
  const verifySubscriptionReceipt = useCallback(async (receiptData: string): Promise<SubscriptionStatus> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/subscriptions/verify`, {
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
      const response = await fetchWithRetry(`${API_BASE_URL}/subscriptions/status`, {
        method: 'GET',
      });
      
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
  }, [fetchWithRetry]);

  // Get user's usage statistics
  const getUserUsageStats = useCallback(async (): Promise<UsageStats> => {
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/usage/stats`, {
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
      const response = await fetchWithRetry(`${API_BASE_URL}/users/me`, {
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