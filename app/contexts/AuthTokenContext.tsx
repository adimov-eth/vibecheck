/**
 * Authentication Token Context
 * Provides authentication token state and management throughout the app
 */
import React, { createContext, useContext, useEffect, ReactNode, useState } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import { AuthTokenContextState } from '../types/auth';

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

  // Initialize the token when the provider mounts
  useEffect(() => {
    const initToken = async (): Promise<void> => {
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
      }
    };

    // Only initialize if not already initialized
    if (!tokenState.tokenInitialized) {
      initToken();
    }
    
    // Token refreshing is handled internally by useAuthToken hook
    // No need for additional refresh logic here

    return () => {};
  }, [getFreshToken, tokenState.tokenInitialized]);

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
 * Custom hook to use the auth token context
 * @returns The current authentication token context state
 */
export function useAuthTokenContext(): AuthTokenContextState {
  return useContext(AuthTokenContext);
} 