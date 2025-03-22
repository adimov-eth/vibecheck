/**
 * Optimized API Client
 * Combines rate limiting, WebSockets, and token management for efficient API access
 */
import { Platform } from 'react-native';
import { rateLimitedFetch, createRateLimitedFunction } from './apiRateLimiter';
import { useGlobalAuthToken } from '../providers/AuthTokenProvider';
import { useCallback } from 'react';

// API base URL (should come from environment config)
const API_BASE_URL = 'https://api.example.com';
// WebSocket URL
const WS_BASE_URL = 'wss://api.example.com/ws';

// Different rate limit settings for different endpoint types
const RATE_LIMIT_SETTINGS = {
  default: 5000, // 5 seconds
  userProfile: 60000, // 1 minute - user profile doesn't change often
  conversations: 15000, // 15 seconds
  messages: 2000, // 2 seconds - more frequent for messages
};

// Request categories for rate limiting
const API_CATEGORIES = {
  auth: 'auth',
  userProfile: 'user-profile',
  conversations: 'conversations',
  messages: 'messages',
  search: 'search',
};

// Determine the rate limit category from URL
function getApiCategory(url: string): string {
  if (url.includes('/auth/')) return API_CATEGORIES.auth;
  if (url.includes('/user/')) return API_CATEGORIES.userProfile;
  if (url.includes('/conversations/')) {
    if (url.includes('/messages/')) return API_CATEGORIES.messages;
    return API_CATEGORIES.conversations;
  }
  if (url.includes('/search/')) return API_CATEGORIES.search;
  return 'default';
}

// Get rate limit setting for a category
function getRateLimitForCategory(category: string): number {
  switch (category) {
    case API_CATEGORIES.userProfile:
      return RATE_LIMIT_SETTINGS.userProfile;
    case API_CATEGORIES.conversations:
      return RATE_LIMIT_SETTINGS.conversations;
    case API_CATEGORIES.messages:
      return RATE_LIMIT_SETTINGS.messages;
    default:
      return RATE_LIMIT_SETTINGS.default;
  }
}

// API client configuration
interface ApiClientConfig {
  baseUrl?: string;
  wsUrl?: string;
  defaultHeaders?: Record<string, string>;
}

// API request options
interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  skipAuth?: boolean;
  useRateLimit?: boolean;
  category?: string;
}

/**
 * Custom hook that provides an optimized API client
 * Uses rate limiting and efficient token management
 */
export function useApiClient(config?: ApiClientConfig) {
  const { getFreshToken } = useGlobalAuthToken();
  const baseUrl = config?.baseUrl || API_BASE_URL;
  const wsUrl = config?.wsUrl || WS_BASE_URL;
  
  /**
   * Make an API request with rate limiting and authentication
   */
  const request = useCallback(async <T = any>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> => {
    const {
      method = 'GET',
      headers = {},
      body,
      skipAuth = false,
      useRateLimit = true,
      category,
    } = options;
    
    const url = `${baseUrl}${endpoint}`;
    
    // Determine the rate limit category
    const rateLimitCategory = category || getApiCategory(endpoint);
    const rateLimitInterval = getRateLimitForCategory(rateLimitCategory);
    
    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Platform': Platform.OS,
      ...config?.defaultHeaders,
      ...headers,
    };
    
    // Add auth token if required
    if (!skipAuth) {
      try {
        const token = await getFreshToken();
        requestHeaders['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Failed to get auth token for request:', error);
        throw new Error('Authentication error: Failed to get token');
      }
    }
    
    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };
    
    // Add body for non-GET requests
    if (method !== 'GET' && body !== undefined) {
      requestOptions.body = JSON.stringify(body);
    }
    
    try {
      // Use rate-limited fetch or regular fetch based on options
      const response = useRateLimit
        ? await rateLimitedFetch(url, requestOptions, {
            key: rateLimitCategory,
            minInterval: rateLimitInterval,
          })
        : await fetch(url, requestOptions);
      
      // Check if the response is OK
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }, [baseUrl, getFreshToken, config?.defaultHeaders]);
  
  /**
   * Create a rate-limited version of a specific API call
   * Useful for frequently used endpoints
   */
  const createRateLimitedApi = useCallback(<T = any>(
    endpoint: string,
    defaultOptions: ApiRequestOptions = {}
  ) => {
    const apiFunction = (customOptions: ApiRequestOptions = {}) => 
      request<T>(endpoint, { ...defaultOptions, ...customOptions });
      
    const category = defaultOptions.category || getApiCategory(endpoint);
    const interval = getRateLimitForCategory(category);
    
    return createRateLimitedFunction(apiFunction, {
      key: `api-${category}-${endpoint}`,
      minInterval: interval,
    });
  }, [request]);
  
  /**
   * Helper method for GET requests
   */
  const get = useCallback(<T = any>(
    endpoint: string,
    options: Omit<ApiRequestOptions, 'method'> = {}
  ): Promise<T> => {
    return request<T>(endpoint, { ...options, method: 'GET' });
  }, [request]);
  
  /**
   * Helper method for POST requests
   */
  const post = useCallback(<T = any>(
    endpoint: string,
    body: any,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> => {
    return request<T>(endpoint, { ...options, method: 'POST', body });
  }, [request]);
  
  /**
   * Helper method for PUT requests
   */
  const put = useCallback(<T = any>(
    endpoint: string,
    body: any,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> => {
    return request<T>(endpoint, { ...options, method: 'PUT', body });
  }, [request]);
  
  /**
   * Helper method for DELETE requests
   */
  const del = useCallback(<T = any>(
    endpoint: string,
    options: Omit<ApiRequestOptions, 'method'> = {}
  ): Promise<T> => {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  }, [request]);
  
  /**
   * Helper method for PATCH requests
   */
  const patch = useCallback(<T = any>(
    endpoint: string,
    body: any,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> => {
    return request<T>(endpoint, { ...options, method: 'PATCH', body });
  }, [request]);
  
  return {
    request,
    get,
    post,
    put,
    del,
    patch,
    createRateLimitedApi,
    baseUrl,
    wsUrl,
  };
} 