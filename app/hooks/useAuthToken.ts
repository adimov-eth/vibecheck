// utils/useAuthToken.ts
import { useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo'; // Assuming Clerk provides this
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthTokenHook {
  getFreshToken: () => Promise<string>;
}

export function useAuthToken(): AuthTokenHook {
  const { getToken } = useAuth();

  const getFreshToken = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');
    await AsyncStorage.setItem('auth_token', token); // Store for background tasks
    return token;
  }, [getToken]);

  useEffect(() => {
    const refreshToken = async () => {
      try {
        const newToken = await getToken();
        if (newToken) await AsyncStorage.setItem('auth_token', newToken);
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    };

    refreshToken(); // Initial refresh
    const interval = setInterval(refreshToken, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [getToken]);

  return { getFreshToken };
}