/**
 * API utilities for handling authenticated requests
 * Provides request interceptors, header generators, and error handling
 */
import { Alert } from 'react-native';
import { TokenStatus, AuthError } from '../types/auth';
import { checkNetworkStatus, NetworkStatus } from './network';

// Constants
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.vibecheck.app';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * API response structure
 */
export interface ApiResponse<T> {
  /** Response data */
  data?: T;
  /** Error if any */
  error?: ApiError;
  /** HTTP status code */
  status: number;
  /** Whether request was successful */
  success: boolean;
}

/**
 * API error structure
 */
export interface ApiError {
  /** Error code for more specific handling */
  code: string;
  /** Error message */
  message: string;
  /** HTTP status code if applicable */
  status?: number;
  /** Original error if available */
  originalError?: Error;
}

/**
 * Request options for API calls
 */
export interface RequestOptions extends RequestInit {
  /** Whether to include authentication header */
  authenticated?: boolean;
  /** Base URL to override default */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to automatically retry on token expiry */
  retryOnExpiry?: boolean;
  /** Custom headers to include */
  customHeaders?: Record<string, string>;
  /** Whether to skip offline check */
  skipOfflineCheck?: boolean;
}

/**
 * Create authentication header using the token
 * @param token Authentication token
 * @returns Header object with authorization
 */
export function createAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`
  };
}

/**
 * Handle API error responses
 * @param error Error from fetch or response
 * @param endpoint API endpoint that was called
 * @returns Structured API error
 */
export function handleApiError(error: unknown, endpoint: string): ApiError {
  // Log error for debugging
  console.error(`API Error [${endpoint}]:`, error);

  // Default error structure
  const apiError: ApiError = {
    code: 'unknown_error',
    message: 'An unexpected error occurred',
  };

  // Handle network errors
  if (error instanceof TypeError && error.message.includes('Network request failed')) {
    apiError.code = 'network_error';
    apiError.message = 'Network connection failed. Please check your internet connection.';
    apiError.originalError = error;
    return apiError;
  }

  // Handle timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    apiError.code = 'timeout_error';
    apiError.message = 'Request timed out. Please try again.';
    apiError.originalError = error;
    return apiError;
  }

  // Handle auth errors
  if (error instanceof AuthError) {
    apiError.code = error.code;
    apiError.message = error.message;
    apiError.originalError = error;
    return apiError;
  }

  // Handle other errors
  if (error instanceof Error) {
    apiError.message = error.message;
    apiError.originalError = error;
  }

  return apiError;
}

/**
 * Generate a fetch request with timeout
 * @param url Request URL
 * @param options Fetch options
 * @returns Promise with fetch and abort controller
 */
function fetchWithTimeout(
  url: string,
  options: RequestOptions = {}
): { fetchPromise: Promise<Response>; controller: AbortController } {
  const controller = new AbortController();
  const { signal } = controller;
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  // Set up timeout
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Create fetch promise
  const fetchPromise = fetch(url, {
    ...options,
    signal,
  }).finally(() => clearTimeout(timeoutId));

  return { fetchPromise, controller };
}

/**
 * Make API request with enhanced error handling and offline support
 * @param endpoint API endpoint (without base URL)
 * @param options Request options
 * @param getToken Function to get authentication token
 * @returns Promise resolving to API response
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
  getToken?: () => Promise<string>
): Promise<ApiResponse<T>> {
  const {
    authenticated = false,
    baseUrl = API_BASE_URL,
    method = 'GET',
    timeout = DEFAULT_TIMEOUT,
    retryOnExpiry = true,
    skipOfflineCheck = false,
    ...fetchOptions
  } = options;

  // Check network status if required
  if (!skipOfflineCheck) {
    const networkStatus = await checkNetworkStatus();
    if (networkStatus === 'disconnected') {
      return {
        error: {
          code: 'offline',
          message: 'You are currently offline. Please check your internet connection.',
        },
        status: 0,
        success: false,
      };
    }
  }

  // Prepare headers
  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  // Add custom headers
  if (options.customHeaders) {
    Object.entries(options.customHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  // Add authentication header if required
  if (authenticated && getToken) {
    try {
      const token = await getToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      return {
        error: handleApiError(error, endpoint),
        status: 401,
        success: false,
      };
    }
  }

  // Prepare URL
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    // Make request with timeout
    const { fetchPromise, controller } = fetchWithTimeout(url, {
      ...fetchOptions,
      method,
      headers,
      timeout,
    });

    const response = await fetchPromise;
    let responseData: T | undefined;
    let errorData: ApiError | undefined;

    // Parse response based on content type
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonData = await response.json();
      if (response.ok) {
        responseData = jsonData;
      } else {
        errorData = {
          code: jsonData.code || 'api_error',
          message: jsonData.message || 'API request failed',
          status: response.status,
        };
      }
    } else if (!response.ok) {
      errorData = {
        code: 'invalid_response',
        message: 'Invalid response format',
        status: response.status,
      };
    }

    // Handle authentication errors with retry
    if (response.status === 401 && authenticated && retryOnExpiry && getToken) {
      try {
        // Force token refresh and retry
        const token = await getToken();
        
        // Update headers with new token
        headers.set('Authorization', `Bearer ${token}`);
        
        // Retry request with new token
        const retryResponse = await fetch(url, {
          ...fetchOptions,
          method,
          headers,
        });

        // Process retry response
        if (retryResponse.ok) {
          if (contentType && contentType.includes('application/json')) {
            responseData = await retryResponse.json();
          }
          
          return {
            data: responseData,
            status: retryResponse.status,
            success: true,
          };
        }
      } catch (retryError) {
        // If retry fails, continue with original error
        console.warn('Token refresh retry failed:', retryError);
      }
    }

    return {
      data: responseData,
      error: errorData,
      status: response.status,
      success: response.ok,
    };
  } catch (error) {
    return {
      error: handleApiError(error, endpoint),
      status: 0,
      success: false,
    };
  }
}

/**
 * Helper for making GET requests
 * @param endpoint API endpoint
 * @param options Request options
 * @param getToken Function to get authentication token
 * @returns Promise resolving to API response
 */
export function apiGet<T>(
  endpoint: string,
  options: RequestOptions = {},
  getToken?: () => Promise<string>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { ...options, method: 'GET' }, getToken);
}

/**
 * Helper for making POST requests
 * @param endpoint API endpoint
 * @param data Request body data
 * @param options Request options
 * @param getToken Function to get authentication token
 * @returns Promise resolving to API response
 */
export function apiPost<T>(
  endpoint: string,
  data: unknown,
  options: RequestOptions = {},
  getToken?: () => Promise<string>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    endpoint,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    },
    getToken
  );
}

/**
 * Helper for making PUT requests
 * @param endpoint API endpoint
 * @param data Request body data
 * @param options Request options
 * @param getToken Function to get authentication token
 * @returns Promise resolving to API response
 */
export function apiPut<T>(
  endpoint: string,
  data: unknown,
  options: RequestOptions = {},
  getToken?: () => Promise<string>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    endpoint,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    },
    getToken
  );
}

/**
 * Helper for making DELETE requests
 * @param endpoint API endpoint
 * @param options Request options
 * @param getToken Function to get authentication token
 * @returns Promise resolving to API response
 */
export function apiDelete<T>(
  endpoint: string,
  options: RequestOptions = {},
  getToken?: () => Promise<string>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { ...options, method: 'DELETE' }, getToken);
}

/**
 * Show API error alert with custom handling options
 * @param error API error to display
 * @param title Alert title
 * @param customActions Custom alert actions
 */
export function showApiErrorAlert(
  error: ApiError,
  title = 'Error',
  customActions?: { text: string; onPress?: () => void }[]
): void {
  Alert.alert(
    title,
    error.message,
    customActions || [{ text: 'OK' }]
  );
}
