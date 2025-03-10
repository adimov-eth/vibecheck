import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuthToken } from '../hooks/useAuthToken';

// Create the context
const AuthTokenContext = createContext<{ tokenInitialized: boolean }>({
  tokenInitialized: false
});

// Context provider component
export function AuthTokenProvider({ children }: { children: ReactNode }) {
  const { getFreshToken } = useAuthToken();
  const [tokenInitialized, setTokenInitialized] = React.useState(false);

  // Initialize the token when the provider mounts
  useEffect(() => {
    const initToken = async () => {
      try {
        await getFreshToken();
        setTokenInitialized(true);
      } catch (error) {
        console.error('Failed to initialize token:', error);
        // We still mark as initialized even on error to prevent infinite retries
        setTokenInitialized(true);
      }
    };

    initToken();
    
    // Token refreshing is handled internally by useAuthToken hook
    // No need for additional refresh logic here

    return () => {};
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