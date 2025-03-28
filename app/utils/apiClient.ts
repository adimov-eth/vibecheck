/**
 * Optimized API Client
 * Combines rate limiting, WebSockets, and token management for efficient API access
 */
import { Platform } from 'react-native';
import { rateLimitedFetch, createRateLimitedFunction } from './apiRateLimiter';
import { useGlobalAuthToken } from '../providers/AuthTokenProvider';
import { useCallback } from 'react';
import { useWebSocketManager, getWebSocketUrl } from './websocketManager';
import { API_ENDPOINTS, API_BASE_URL } from './apiEndpoints';
import { ApiError } from '../hooks/useAPI';

// Different rate limit settings for different endpoint types
const RATE_LIMIT_SETTINGS = {
  default: 5000, // 5 seconds
  userProfile: 60000, // 1 minute - user profile doesn't change often
  conversations: 15000, // 15 seconds
  messages: 2000, // 2 seconds - more frequent for messages
  audio: 10000, // 10 seconds - audio uploads happen less frequently
};

// Request categories for rate limiting
const API_CATEGORIES = {
  auth: 'auth',
  userProfile: 'users',
  conversations: 'conversations',
  messages: 'messages',
  audio: 'audio',
  subscriptions: 'subscriptions',
  usage: 'usage',
};

// Determine the rate limit category from URL
function getApiCategory(url: string): string {
  if (url.includes('/auth')) return API_CATEGORIES.auth;
  if (url.includes('/users')) return API_CATEGORIES.userProfile;
  if (url.includes('/audio')) return API_CATEGORIES.audio;
  if (url.includes('/subscriptions')) return API_CATEGORIES.subscriptions;
  if (url.includes('/usage')) return API_CATEGORIES.usage;
  if (url.includes('/conversations')) {
    if (url.includes('/messages')) return API_CATEGORIES.messages;
    return API_CATEGORIES.conversations;
  }
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
    case API_CATEGORIES.audio:
      return RATE_LIMIT_SETTINGS.audio;
    default:
      return RATE_LIMIT_SETTINGS.default;
  }
}

// API client configuration
interface ApiClientConfig {
  baseUrl?: string;
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
  useWebSocket?: boolean;
}

// File upload options
interface FileUploadOptions {
  uri: string;
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
  formData?: Record<string, any>;
  skipAuth?: boolean;
  useWebSocket?: boolean;
  onProgress?: (progress: number) => void;
}

/**
 * Custom hook that provides an optimized API client
 * Uses rate limiting, WebSockets, and efficient token management
 */
export function useApiClient(config?: ApiClientConfig) {
  const { getFreshToken } = useGlobalAuthToken();
  const baseUrl = config?.baseUrl || API_BASE_URL;
  const wsUrl = getWebSocketUrl(baseUrl);
  
  // Initialize WebSocket connection
  const { 
    connectionState, 
    subscribe, 
    sendMessage 
  } = useWebSocketManager(wsUrl);
  
  const isWebSocketConnected = connectionState === 'connected';
  
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
      useWebSocket = false,
    } = options;
    
    // If WebSocket is requested and available, consider using it for supported operations
    if (useWebSocket && isWebSocketConnected) {
      // Currently, only GET requests to conversation endpoints support WebSocket
      if (
        method === 'GET' && 
        endpoint.startsWith('/conversations/') && 
        !endpoint.includes('/messages')
      ) {
        console.log(`Using WebSocket for endpoint: ${endpoint}`);
        
        // Extract conversation ID from endpoint
        const conversationId = endpoint.replace('/conversations/', '').split('/')[0];
        
        // Subscribe to conversation updates
        const topic = `conversation:${conversationId}`;
        subscribe(topic);
      }
    }
    
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
      console.log(`API request to ${url}`);
      
      // Use rate-limited fetch or regular fetch based on options
      const response = useRateLimit
        ? await rateLimitedFetch(url, requestOptions, {
            key: rateLimitCategory,
            minInterval: rateLimitInterval,
          })
        : await fetch(url, requestOptions);
      
      // Enhanced error handling with specific status codes
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(`Authentication failed: ${response.statusText}`, {
          status: response.status,
          isAuthError: true,
          code: 'AUTH_FAILED'
        });
      } else if (response.status === 429) {
        // Rate limit exceeded
        
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
        // Try to parse error data from response
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Unknown error' };
        }
        
        throw new ApiError(errorData.error || `API error (${response.status})`, {
          status: response.status,
          code: errorData.code || 'REQUEST_FAILED'
        });
      }
      
      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      // If it's already our ApiError, just rethrow it
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Log the error with useful context
      console.error(`API request failed: ${url}`, error);
      
      // Identify network errors
      if (error instanceof TypeError && 
          (error.message.includes('Network request failed') || 
           error.message.includes('network error'))) {
        throw new ApiError('Network connection error. Please check your internet connection.', {
          isNetworkError: true,
          code: 'NETWORK_ERROR'
        });
      }
      
      // Wrap other errors to have consistent error handling
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown API error',
        { code: 'UNKNOWN_ERROR' }
      );
    }
  }, [baseUrl, getFreshToken, config?.defaultHeaders, isWebSocketConnected, subscribe]);

  /**
   * Upload a file to the server
   */
  const uploadFile = useCallback(async <T = any>(
    endpoint: string,
    options: FileUploadOptions
  ): Promise<T> => {
    const {
      uri,
      fieldName = 'file',
      fileName,
      mimeType = 'application/octet-stream',
      formData = {},
      skipAuth = false,
      useWebSocket = true,
      onProgress,
    } = options;
    
    const url = `${baseUrl}${endpoint}`;
    
    // Create FormData object
    const data = new FormData();
    
    // Add file
    const file = {
      uri,
      type: mimeType,
      name: fileName || uri.split('/').pop() || 'file',
    } as any;
    
    data.append(fieldName, file);
    
    // Add additional form data
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        data.append(key, String(value));
      }
    });
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'multipart/form-data',
      'X-Platform': Platform.OS,
      ...config?.defaultHeaders,
    };
    
    // Add auth token if required
    if (!skipAuth) {
      try {
        const token = await getFreshToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Failed to get auth token for upload:', error);
        throw new Error('Authentication error: Failed to get token');
      }
    }

    // If WebSocket is requested and available, subscribe to the conversation
    if (useWebSocket && isWebSocketConnected && formData.conversationId) {
      console.log(`Subscribing to conversation for upload: ${formData.conversationId}`);
      
      // Subscribe to conversation updates via WebSocket
      const topic = `conversation:${formData.conversationId}`;
      subscribe(topic);
      
      // Notify about upload start
      sendMessage('conversation_upload_started', {
        conversationId: formData.conversationId,
        fileType: mimeType,
        timestamp: new Date().toISOString(),
      }, topic);
    }
    
    try {
      console.log(`Uploading file to ${url}`);
      
      // Perform upload
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: data,
      });
      
      // Check if the response is OK
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload error (${response.status}): ${errorText}`);
      }
      
      // Parse JSON response
      const responseData = await response.json();
      
      // If WebSocket is requested and available, notify about upload completion
      if (useWebSocket && isWebSocketConnected && formData.conversationId) {
        sendMessage('conversation_upload_completed', {
          conversationId: formData.conversationId,
          timestamp: new Date().toISOString(),
        }, `conversation:${formData.conversationId}`);
      }
      
      // Trigger progress completion
      if (onProgress) {
        onProgress(100);
      }
      
      return responseData as T;
    } catch (error) {
      console.error(`File upload failed: ${url}`, error);
      
      // If WebSocket is connected, notify about upload error
      if (useWebSocket && isWebSocketConnected && formData.conversationId) {
        sendMessage('conversation_upload_error', {
          conversationId: formData.conversationId,
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        }, `conversation:${formData.conversationId}`);
      }
      
      throw error;
    }
  }, [baseUrl, getFreshToken, config?.defaultHeaders, isWebSocketConnected, subscribe, sendMessage]);
  
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

  /**
   * Helper for creating a new conversation with associated files via WebSocket
   */
  const createConversationWithFiles = useCallback(async (
    modeId: string,
    files: { uri: string, fieldName?: string, type?: string }[],
    options: {
      metadata?: Record<string, any>;
      onProgress?: (progress: number) => void;
    } = {}
  ) => {
    try {
      // First create a new conversation
      const conversation = await post('/conversations', {
        modeId,
        metadata: options.metadata || {},
      });
      
      console.log(`Created conversation: ${conversation.id} for mode: ${modeId}`);
      
      // Subscribe to conversation updates
      if (isWebSocketConnected) {
        subscribe(`conversation:${conversation.id}`);
      }
      
      // Upload each file
      let progress = 0;
      const totalFiles = files.length;
      const fileResults = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progressPerFile = 100 / totalFiles;
        
        // Create a progress handler for this file
        const fileProgressHandler = (fileProgress: number) => {
          // Calculate overall progress
          const overallProgress = progress + (fileProgress * progressPerFile / 100);
          if (options.onProgress) {
            options.onProgress(overallProgress);
          }
        };
        
        // Upload the file
        const result = await uploadFile('/audio', {
          uri: file.uri,
          fieldName: file.fieldName || 'file',
          mimeType: file.type || 'audio/m4a',
          formData: {
            conversationId: conversation.id,
          },
          onProgress: fileProgressHandler,
          useWebSocket: true,
        });
        
        fileResults.push(result);
        progress += progressPerFile;
        
        // Update overall progress
        if (options.onProgress) {
          options.onProgress(progress);
        }
      }
      
      return {
        conversation,
        files: fileResults,
      };
    } catch (error) {
      console.error('Failed to create conversation with files:', (error as Error).message);
      throw error;
    }
  }, [post, uploadFile, isWebSocketConnected, subscribe]);
  
  /**
   * Verifies a subscription purchase receipt
   * @param platform - 'ios' or 'android'
   * @param receipt - Receipt data string
   * @param productId - ID of the purchased product
   */
  const verifySubscription = (platform: string, receipt: string, productId: string) => 
    request<{valid: boolean; expiresAt: string; subscriptionId: string}>(
      API_ENDPOINTS.SUBSCRIPTION_VERIFY, 
      { 
        method: 'POST',
        body: JSON.stringify({ platform, receipt, productId })
      }
    );

  /**
   * Gets the current user's subscription status
   * @returns Promise with subscription data
   */
  const getSubscriptionStatus = () => 
    request<{active: boolean; tier: string; expiresAt: string}>(
      API_ENDPOINTS.SUBSCRIPTION_STATUS
    );

  /**
   * Gets the current user's usage statistics
   * @returns Promise with usage data
   */
  const getUsageStats = () => 
    request<{used: number; limit: number; resetsAt: string}>(
      API_ENDPOINTS.USAGE_STATS
    );

  return {
    request,
    get,
    post,
    put,
    del,
    patch,
    uploadFile,
    createRateLimitedApi,
    createConversationWithFiles,
    verifySubscription,
    getSubscriptionStatus,
    getUsageStats,
    baseUrl,
    wsUrl,
    isWebSocketConnected,
  };
}