import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export function useAuthentication() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is authenticated
  const checkAuthStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = await SecureStore.getItemAsync('apple_identity_token');
      const userId = await SecureStore.getItemAsync('user_id');
      const email = await SecureStore.getItemAsync('apple_user_email');
      const fullnameJson = await SecureStore.getItemAsync('apple_user_fullname');
      
      const hasAuth = !!token && !!userId;
      setIsAuthenticated(hasAuth);
      
      if (hasAuth) {
        let name = '';
        if (fullnameJson) {
          try {
            const fullname = JSON.parse(fullnameJson);
            if (fullname.givenName && fullname.familyName) {
              name = `${fullname.givenName} ${fullname.familyName}`;
            }
          } catch (e) {
            console.error('Error parsing fullname:', e);
          }
        }
        
        setUser({
          id: userId || '',
          email: email || '',
          name: name
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      // Clear all secure storage items related to authentication
      await Promise.all([
        SecureStore.deleteItemAsync('apple_identity_token'),
        SecureStore.deleteItemAsync('apple_user'),
        SecureStore.deleteItemAsync('apple_user_email'),
        SecureStore.deleteItemAsync('apple_user_fullname'),
        SecureStore.deleteItemAsync('user_id'),
        SecureStore.deleteItemAsync('auth_token')
      ]);
      
      setIsAuthenticated(false);
      setUser(null);
      
      // Navigate to the auth screen
      router.replace('/(auth)/authenticate');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [router]);

  // Initialize authentication check
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return {
    isAuthenticated,
    isLoading,
    user,
    signOut,
    refreshAuthStatus: checkAuthStatus
  };
}