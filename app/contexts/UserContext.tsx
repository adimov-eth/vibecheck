/**
 * User Context
 * Provides user profile information throughout the app
 */
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { UserContextState, UserProfile } from '../types/user';
import { useApi } from '../hooks/useAPI';
import { useAuth } from '@clerk/clerk-expo';
import { useAuthTokenContext } from './AuthTokenContext';

// Default context value
const defaultContextValue: UserContextState = {
  profile: null,
  isLoading: false,
  hasError: false,
  errorMessage: undefined,
  refreshProfile: async () => {},
};

// Create the context
const UserContext = createContext<UserContextState>(defaultContextValue);

// Max retry attempts for fetch
const MAX_RETRY_ATTEMPTS = 3;
// Base delay between retries (ms)
const BASE_RETRY_DELAY = 1000;

/**
 * User Provider component
 * Manages user profile state throughout the app
 */
export function UserProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<UserContextState>(defaultContextValue);
  const { getUserProfile } = useApi();
  const { isSignedIn, isLoaded } = useAuth();
  const { tokenInitialized } = useAuthTokenContext();
  
  // Track fetch attempts to implement backoff
  const retryCount = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetching = useRef(false);

  // Calculate exponential backoff delay
  const getBackoffDelay = (attempt: number): number => {
    return Math.min(
      BASE_RETRY_DELAY * Math.pow(2, attempt),
      30000 // Max 30 seconds
    );
  };

  // Function to fetch user profile with retry logic
  const fetchUserProfile = useCallback(async () => {
    // Skip fetch if user is not signed in
    if (!isSignedIn) {
      setState(prev => ({
        ...prev,
        profile: null,
        isLoading: false,
        hasError: false,
      }));
      return;
    }

    // Skip fetch if token is not initialized
    if (!tokenInitialized) {
      return;
    }

    // Prevent concurrent fetches
    if (isFetching.current) {
      return;
    }

    isFetching.current = true;
    setState(prev => ({
      ...prev,
      isLoading: true,
      hasError: false,
    }));

    try {
      const profile = await getUserProfile();
      setState(prev => ({
        ...prev,
        profile,
        isLoading: false,
      }));
      // Reset retry counter on success
      retryCount.current = 0;
    } catch (error) {
      console.error('Error loading profile:', error);
      
      // Implement retry with exponential backoff
      if (retryCount.current < MAX_RETRY_ATTEMPTS) {
        const delay = getBackoffDelay(retryCount.current);
        console.log(`Retrying profile fetch in ${delay}ms (attempt ${retryCount.current + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        // Clear any existing timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        
        // Set retry timeout
        retryTimeoutRef.current = setTimeout(() => {
          retryCount.current += 1;
          isFetching.current = false;
          fetchUserProfile();
        }, delay);
        
        // Don't set error state during retry attempts
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
      } else {
        // Max retries reached, set error state
        const errorMessage = error instanceof Error ? error.message : 'Failed to load user profile';
        setState(prev => ({
          ...prev,
          isLoading: false,
          hasError: true,
          errorMessage,
        }));
        // Reset retry counter after giving up
        retryCount.current = 0;
      }
    } finally {
      if (retryCount.current === 0) {
        isFetching.current = false;
      }
    }
  }, [getUserProfile, isSignedIn, tokenInitialized]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Fetch profile only when auth is loaded, user is signed in, and token is initialized
  useEffect(() => {
    if (isLoaded && isSignedIn && tokenInitialized && !isFetching.current) {
      fetchUserProfile();
    }
  }, [fetchUserProfile, isLoaded, isSignedIn, tokenInitialized]);

  // Provide the refresh function to context consumers
  const refreshProfile = useCallback(() => {
    // Reset retry counter on manual refresh
    retryCount.current = 0;
    isFetching.current = false;
    return fetchUserProfile();
  }, [fetchUserProfile]);

  return (
    <UserContext.Provider
      value={{
        ...state,
        refreshProfile,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access the user context
 */
export function useUser(): UserContextState {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
} 