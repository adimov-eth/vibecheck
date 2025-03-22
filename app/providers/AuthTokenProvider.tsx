/**
 * Auth Token Provider
 * Centralizes auth token management to prevent multiple hook instances
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';
import { AuthTokenHook } from '../types/auth';

// Create context for global auth token access
const AuthTokenContext = createContext<AuthTokenHook | null>(null);

interface AuthTokenProviderProps {
  children: ReactNode;
}

/**
 * Provides centralized auth token management across the application
 * Prevents multiple instances of useAuthToken from causing redundant API requests
 */
export function AuthTokenProvider({ children }: AuthTokenProviderProps): JSX.Element {
  // Single instance of the auth token hook
  const authToken = useAuthToken();
  
  return (
    <AuthTokenContext.Provider value={authToken}>
      {children}
    </AuthTokenContext.Provider>
  );
}

/**
 * Hook to access the centralized auth token management
 * Use this hook instead of useAuthToken directly
 */
export function useGlobalAuthToken(): AuthTokenHook {
  const context = useContext(AuthTokenContext);
  
  if (!context) {
    throw new Error('useGlobalAuthToken must be used within an AuthTokenProvider');
  }
  
  return context;
} 