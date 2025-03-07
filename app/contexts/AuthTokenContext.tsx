import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuthTokenManager } from '../utils/auth';

// Create the context
const AuthTokenContext = createContext<{ tokenInitialized: boolean }>({
  tokenInitialized: false
});

// Context provider component
export function AuthTokenProvider({ children }: { children: ReactNode }) {
  const { refreshToken } = useAuthTokenManager();
  const [tokenInitialized, setTokenInitialized] = React.useState(false);

  // Initialize the token when the provider mounts
  useEffect(() => {
    const initToken = async () => {
      try {
        await refreshToken();
        setTokenInitialized(true);
      } catch (error) {
        console.error('Failed to initialize token:', error);
        // We still mark as initialized even on error to prevent infinite retries
        setTokenInitialized(true);
      }
    };

    initToken();
    
    // Set up token refresh interval (every 30 minutes)
    const refreshInterval = setInterval(async () => {
      try {
        await refreshToken();
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);

  return (
    <AuthTokenContext.Provider value={{ tokenInitialized }}>
      {children}
    </AuthTokenContext.Provider>
  );
}

// Custom hook to use the auth token context
export function useAuthTokenContext() {
  return useContext(AuthTokenContext);
} 