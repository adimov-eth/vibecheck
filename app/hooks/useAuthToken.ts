/**
 * Authentication token management hook
 * Provides functionality to get, refresh, and manage auth tokens
 */
import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthTokenHook, TokenStatus, TokenMetadata, AuthError } from '../types/auth';

// Token storage key
const AUTH_TOKEN_KEY = 'auth_token';
// Refresh interval in milliseconds (1 minute - more frequent to avoid problems)
const TOKEN_REFRESH_INTERVAL = 1 * 60 * 1000;
// Maximum number of refresh retries
const MAX_REFRESH_RETRIES = 5;
// Rate limiting - minimum time between refreshes in ms (5 seconds)
const MIN_REFRESH_INTERVAL = 5000;

// Define proper interface for the Clerk auth object to handle variations
interface ClerkAuth {
  getToken: () => Promise<string>;
  // isSignedIn can be either a boolean or a function
  isSignedIn: boolean | (() => Promise<boolean>);
  // Add session property
  sessionId?: string;
}

/**
 * Custom hook for managing authentication tokens
 * Provides methods to get fresh tokens and handles automatic token refreshing
 * with advanced error handling and recovery strategies
 * @returns AuthTokenHook interface with token management functions
 */
export function useAuthToken(): AuthTokenHook {
  // Use the proper type for the auth object
  const auth = useAuth() as unknown as ClerkAuth;
  const { getToken } = auth;
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastError, setLastError] = useState<Error | undefined>(undefined);
  const [retryCount, setRetryCount] = useState<number>(0);
  // Track token status and expiry information
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('unknown');
  const [tokenExpiryTime, setTokenExpiryTime] = useState<number | null>(null);
  // For optimization and rate limiting purposes
  const lastRefreshAttempt = useRef<number>(0);
  // Add a promise ref to track ongoing token refreshes
  const refreshPromise = useRef<Promise<string> | null>(null);
  const router = useRouter();

  /**
   * Parse and extract token metadata if possible
   * @param token - JWT token string
   * @returns Parsed token with expiry information if valid
   */
  const parseTokenData = (token: string): TokenMetadata | null => {
    if (!token) return null;
    
    try {
      // Extract token parts
      const [, payload] = token.split('.');
      if (!payload) return null;
      
      // Decode the base64 payload
      const decodedPayload = JSON.parse(atob(payload));
      
      // Extract expiry time
      const expiryTime = decodedPayload.exp ? decodedPayload.exp * 1000 : null; // Convert to milliseconds
      const issuedAt = decodedPayload.iat ? decodedPayload.iat * 1000 : Date.now();
      
      return {
        token,
        expiryTime,
        issuedAt,
        // Calculate time-to-live in milliseconds, default to 1 hour if expiry not found
        ttl: expiryTime ? expiryTime - Date.now() : 60 * 60 * 1000
      };
    } catch (error) {
      console.warn('Failed to parse token:', error);
      return null;
    }
  };

  /**
   * Check if a token is about to expire soon
   * @param expiryTime - Token expiry timestamp
   * @returns Whether the token needs refreshing
   */
  const isTokenExpiringSoon = (expiryTime: number | null): boolean => {
    if (!expiryTime) return true; // If we don't know expiry, refresh to be safe
    
    // Consider tokens expiring within 5 minutes as "expiring soon"
    const expiryThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() + expiryThreshold > expiryTime;
  };

  /**
   * Get a fresh authentication token, either from cache or by refreshing
   * Implements rate limiting and prevents concurrent requests
   */
  const getFreshToken = useCallback(async (): Promise<string> => {
    const now = Date.now();
    
    // Rate limiting check - don't refresh more than once per 5 seconds
    const timeSinceLastRefresh = now - lastRefreshAttempt.current;
    if (isRefreshing && timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
      if (refreshPromise.current) {
        return refreshPromise.current;
      }
      throw new Error('Token refresh rate limited');
    }
    
    try {
      // Update refresh timestamp and status
      lastRefreshAttempt.current = now;
      setIsRefreshing(true);
      
      // Create a new refresh promise
      refreshPromise.current = (async () => {
        // First try to load cached token and validate
        try {
          const cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
          
          if (cachedToken) {
            const tokenData = parseTokenData(cachedToken);
            
            // If token exists and is not expired (with 30s buffer), return it
            if (tokenData && tokenData.expiryTime && tokenData.expiryTime - now > 30000) {
              setTokenStatus('valid');
              setTokenExpiryTime(tokenData.expiryTime);
              // Reset error state on success
              setLastError(undefined);
              return cachedToken;
            }
          }
        } catch (cacheError) {
          console.warn('Error reading cached token:', cacheError);
        }
        
        // If we get here, we need a fresh token
        try {
          // Get new token from Clerk
          const newToken = await getToken();
          
          if (newToken) {
            // Save token to AsyncStorage
            await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
            
            // Parse and set token metadata
            const tokenData = parseTokenData(newToken);
            if (tokenData?.expiryTime) {
              setTokenExpiryTime(tokenData.expiryTime);
            }
            
            setTokenStatus('valid');
            setRetryCount(0);  // Reset retry count on success
            setLastError(undefined);
            
            return newToken;
          } else {
            throw new Error('Failed to get token from auth provider');
          }
        } catch (tokenError) {
          // Increment retry count for exponential backoff
          setRetryCount((prev) => prev + 1);
          
          if (retryCount >= MAX_REFRESH_RETRIES) {
            setTokenStatus('invalid');
            handleInvalidToken();
            throw new Error(
              `Failed to refresh token after ${MAX_REFRESH_RETRIES} attempts: ${
                tokenError instanceof Error ? tokenError.message : String(tokenError)
              }`
            );
          }
          
          // Rethrow to trigger retry mechanism
          throw tokenError;
        }
      })();
      
      return await refreshPromise.current;
    } catch (error) {
      const errorMessage = `Token refresh failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      setLastError(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    } finally {
      setIsRefreshing(false);
      refreshPromise.current = null;
    }
  }, [getToken, parseTokenData, retryCount]);

  /**
   * Handle an invalid or revoked token
   * This will clear local storage and potentially redirect to login
   */
  const handleInvalidToken = async (): Promise<void> => {
    // Clear stored token data
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setTokenStatus('invalid');
    setTokenExpiryTime(null);
    
    // Check auth state after clearing token
    let isCurrentlySignedIn = false;
    try {
      // Check sign-in status using the proper ClerkAuth interface
      if (typeof auth.isSignedIn === 'function') {
        isCurrentlySignedIn = await auth.isSignedIn();
      } else {
        isCurrentlySignedIn = !!auth.isSignedIn;
      }
    } catch (error) {
      console.warn('Error checking sign-in status:', error);
    }
    
    // Only redirect to sign-in if user is not already signed in
    // This prevents redirect loops
    if (!isCurrentlySignedIn) {
      // Use alert to inform the user before redirecting
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please sign in again.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }]
      );
    }
  };

  /**
   * Clear any stored authentication token
   * Useful for logout operations
   */
  const clearToken = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      setTokenStatus('invalid');
      setTokenExpiryTime(null);
      setRetryCount(0);
    } catch (error) {
      console.error('Failed to clear auth token:', error);
      setLastError(error instanceof Error ? error : new Error('Failed to clear token'));
    }
  }, []);
  
  /**
   * Validate if a token is still valid or needs refresh
   * @returns Promise resolving to validation result
   */
  const validateToken = useCallback(async (): Promise<boolean> => {
    try {
      // First check our cached status
      if (tokenStatus === 'invalid') return false;
      
      // Then check storage
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        setTokenStatus('invalid');
        return false;
      }
      
      // Parse token data
      const tokenData = parseTokenData(storedToken);
      
      // Update our cache
      if (tokenData?.expiryTime) {
        setTokenExpiryTime(tokenData.expiryTime);
        
        // Check if expired
        if (Date.now() > tokenData.expiryTime) {
          setTokenStatus('expired');
          return false;
        }
      }
      
      // If we have no expiry data, verify with provider
      if (!tokenData?.expiryTime) {
        // This will throw if invalid
        await getToken();
      }
      
      setTokenStatus('valid');
      return true;
    } catch (error) {
      setTokenStatus('invalid');
      return false;
    }
  }, [getToken, tokenStatus]);

  useEffect(() => {
    // Validate token on mount
    validateToken().catch(() => {
      // Silently handle validation errors
    });
    
    // Automatically refresh the token on a regular interval with enhanced exponential backoff
    const refreshToken = async (): Promise<void> => {
      if (isRefreshing) return;

      try {
        // Don't refresh if not signed in
        let signedIn = false;
        try {
          // Check sign-in status using the proper ClerkAuth interface
          if (typeof auth.isSignedIn === 'function') {
            signedIn = await auth.isSignedIn();
          } else {
            signedIn = !!auth.isSignedIn;
          }
        } catch (error) {
          console.warn('Error checking sign-in status during refresh:', error);
        }
        if (!signedIn) return;
        
        setIsRefreshing(true);
        
        // First check if cached token is still valid
        const isTokenValid = await validateToken();
        
        // Only refresh if token is invalid, expired, or expiring soon
        if (!isTokenValid || (tokenExpiryTime && isTokenExpiringSoon(tokenExpiryTime))) {
          const newToken = await getToken();
          
          if (newToken) {
            const tokenData = parseTokenData(newToken);
            
            await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
            
            if (tokenData?.expiryTime) {
              setTokenExpiryTime(tokenData.expiryTime);
            }
            
            setTokenStatus('valid');
            // Reset retry count on success
            setRetryCount(0);
            setLastError(undefined);
          }
        } else {
          // Token is still valid, no need to retry
          setRetryCount(0);
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
        setLastError(error instanceof Error ? error : new Error('Failed to refresh token'));
        
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          
          // Don't increment retry count for network errors - use constant backoff instead
          if (!errorMessage.includes('network')) {
            // Implement enhanced exponential backoff for auth-related retries
            setRetryCount((prev) => Math.min(prev + 1, MAX_REFRESH_RETRIES));
          }
        } else {
          // Unknown error, increment retry count
          setRetryCount((prev) => Math.min(prev + 1, MAX_REFRESH_RETRIES));
        }
      } finally {
        setIsRefreshing(false);
      }
    };

    // Initial refresh - don't run immediately to avoid competing with validation
    const initialTimer = setTimeout(refreshToken, 1000);
    
    // Calculate backoff time with more sophisticated algorithm
    // - For network errors: use a constant 60-second retry
    // - For auth errors: use exponential backoff with jitter
    const baseInterval = TOKEN_REFRESH_INTERVAL; // e.g., 15 minutes
    const networkErrorInterval = 60 * 1000; // 60 seconds
    
    let backoffTime: number;
    
    if (lastError?.message?.toLowerCase().includes('network')) {
      // Network errors use constant backoff
      backoffTime = networkErrorInterval;
    } else if (retryCount === 0) {
      // Normal refresh interval
      backoffTime = baseInterval;
    } else {
      // Exponential backoff with jitter for better distribution
      // Max backoff of 30 minutes
      const rawBackoff = Math.min(
        baseInterval * Math.pow(1.5, retryCount),
        30 * 60 * 1000
      );
      
      // Add jitter (±10%) to prevent synchronized retries
      const jitterFactor = 0.9 + (Math.random() * 0.2); // 0.9-1.1
      backoffTime = Math.floor(rawBackoff * jitterFactor);
    }
      
    const interval = setInterval(refreshToken, backoffTime);
    
    // Cleanup intervals on unmount
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [getToken, retryCount, isRefreshing, tokenExpiryTime, tokenStatus, validateToken, lastError, auth]);

  return { 
    getFreshToken,
    isRefreshing,
    lastError,
    retryCount,
    clearToken,
    validateToken,
    tokenStatus
  };
}