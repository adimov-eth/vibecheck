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

// Global tracker for ongoing token operations to prevent duplicate requests
const globalRefreshPromise: { current: Promise<string> | null } = { current: null };

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
  // We don't need a local refreshPromise since we're using a global one
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
   * Get a fresh authentication token, either from cache or by refreshing
   * Implements rate limiting and prevents concurrent requests
   */
  const getFreshToken = useCallback(async (): Promise<string> => {
    // If there's already a global refresh in progress, reuse it
    if (globalRefreshPromise.current) {
      return globalRefreshPromise.current;
    }
    
    // Implement rate limiting
    const now = Date.now();
    if (now - lastRefreshAttempt.current < MIN_REFRESH_INTERVAL) {
      // If we have a cached token and we're being rate limited, use it
      const cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (cachedToken) {
        return cachedToken;
      }
    }
    
    // Update last attempt timestamp
    lastRefreshAttempt.current = now;
    
    try {
      const promise = getToken();
      globalRefreshPromise.current = promise;
      
      const token = await promise;
      
      // Cache the token
      if (token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      }
      
      return token;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw error;
    } finally {
      globalRefreshPromise.current = null;
    }
  }, [getToken]);

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
      
      // Update our cache - but only if value has changed
      if (tokenData?.expiryTime && tokenData.expiryTime !== tokenExpiryTime) {
        setTokenExpiryTime(tokenData.expiryTime);
        
        // Check if expired
        if (Date.now() > tokenData.expiryTime) {
          setTokenStatus('expired');
          return false;
        }
      }
      
      // If we have no expiry data or token is about to expire, verify with provider
      const shouldVerifyWithProvider = !tokenData?.expiryTime || 
        (tokenData.expiryTime && isTokenExpiringSoon(tokenData.expiryTime));
        
      if (shouldVerifyWithProvider) {
        try {
          // This will throw if invalid
          await getToken();
          
          // Only set status if it's changing
          if (tokenStatus !== 'valid') {
            setTokenStatus('valid');
          }
          return true;
        } catch (verifyError) {
          // Check if we can still extract userId from the token
          // Even with invalid session, the token might contain valid user identification
          if (tokenData) {
            console.log('Session validation failed, but token data still available:', verifyError);
            // We'll mark as valid but log the issue
            // This matches server behavior of "Session invalid but using userId from token"
            setTokenStatus('valid');
            return true;
          } else {
            setTokenStatus('invalid');
            return false;
          }
        }
      }
      
      // Only set status if it's changing
      if (tokenStatus !== 'valid') {
        setTokenStatus('valid');
      }
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      setTokenStatus('invalid');
      return false;
    }
  }, [getToken, tokenStatus, tokenExpiryTime, parseTokenData, isTokenExpiringSoon]);

  useEffect(() => {
    // Validate token on mount
    validateToken().catch(() => {
      // Silently handle validation errors
    });
    
    // Automatically refresh the token on a regular interval with enhanced exponential backoff
    const refreshToken = async (): Promise<void> => {
      // Don't refresh if another refresh is in progress globally
      if (isRefreshing || globalRefreshPromise.current) return;

      // Implement rate limiting for refresh attempts
      const now = Date.now();
      if (now - lastRefreshAttempt.current < MIN_REFRESH_INTERVAL) {
        return;
      }
      
      // Update last attempt timestamp
      lastRefreshAttempt.current = now;

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
          try {
            // Use getFreshToken which handles deduplication
            const newToken = await getFreshToken();
            
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
          } catch (refreshError) {
            console.warn('Token refresh error in interval:', refreshError);
            
            // Check if we can extract user ID at least
            const cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
            if (cachedToken) {
              const tokenData = parseTokenData(cachedToken);
              if (tokenData) {
                // We have token data even if session is invalid
                // This matches the server's "Session invalid but using userId from token" behavior
                console.log('Using token with user ID despite session validation failure');
                // Keep the token as is, don't reset status
                return;
              }
            }
            
            // If we can't extract user ID, proceed with normal error handling
            throw refreshError;
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
  }, [getToken, retryCount, isRefreshing, tokenExpiryTime, tokenStatus, validateToken, lastError, auth, parseTokenData, isTokenExpiringSoon]);

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