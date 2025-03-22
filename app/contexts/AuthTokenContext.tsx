/**
 * Authentication Token Context
 * Provides authentication token state and management throughout the app
 */
import React, { createContext, useContext, useEffect, ReactNode, useState, useRef } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import { AuthTokenContextState } from '../types/auth';
import { useAuth } from '@clerk/clerk-expo';

// Default context value
const defaultContextValue: AuthTokenContextState = {
  tokenInitialized: false,
  errorMessage: undefined
};

// Create the context with rich type information
const AuthTokenContext = createContext<AuthTokenContextState>(defaultContextValue);

/**
 * Authentication Token Provider component
 * Manages token initialization and state throughout the app
 * @param children - React child components
 */
export function AuthTokenProvider({ children }: { children: ReactNode }): JSX.Element {
  const { getFreshToken, isRefreshing, lastError, clearToken } = useAuthToken();
  const [tokenState, setTokenState] = useState<AuthTokenContextState>(defaultContextValue);
  // Track initialization attempts to prevent multiple concurrent calls
  const isInitializing = useRef(false);
  const { isSignedIn, isLoaded } = useAuth();

  // Initialize the token when the provider mounts
  useEffect(() => {
    // Only proceed when auth is loaded
    if (!isLoaded) return;

    const initToken = async (): Promise<void> => {
      // If user is not signed in, don't try to get a token
      if (!isSignedIn) {
        setTokenState({
          tokenInitialized: true,
          errorMessage: undefined
        });
        return;
      }
      
      // Prevent multiple concurrent initialization attempts
      if (isInitializing.current) return;
      
      isInitializing.current = true;
      try {
        await getFreshToken();
        setTokenState({
          tokenInitialized: true,
          errorMessage: undefined
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize token';
        console.error('Token initialization error:', error);
        
        // We still mark as initialized even on error to prevent infinite retries
        setTokenState({
          tokenInitialized: true,
          errorMessage
        });
      } finally {
        isInitializing.current = false;
      }
    };

    // Only initialize if not already initialized
    if (!tokenState.tokenInitialized && !isRefreshing && !isInitializing.current) {
      initToken();
    }
    
    // Token refreshing is handled internally by useAuthToken hook
    // No need for additional refresh logic here

    return () => {};
  }, [getFreshToken, tokenState.tokenInitialized, isRefreshing, isSignedIn, isLoaded]);

  // Update error state when lastError changes in the hook
  useEffect(() => {
    if (lastError && tokenState.errorMessage !== lastError.message) {
      setTokenState(prev => ({
        ...prev,
        errorMessage: lastError.message
      }));
    }
  }, [lastError, tokenState.errorMessage]);

  return (
    <AuthTokenContext.Provider value={tokenState}>
      {children}
    </AuthTokenContext.Provider>
  );
}

/**
 * Hook to access the authentication token context
 * @returns The authentication token context state
 */
export function useAuthTokenContext(): AuthTokenContextState {
  const context = useContext(AuthTokenContext);
  if (context === undefined) {
    throw new Error('useAuthTokenContext must be used within an AuthTokenProvider');
  }
  return context;
} 