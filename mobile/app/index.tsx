import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await SecureStore.getItemAsync('apple_identity_token');
        const userId = await SecureStore.getItemAsync('user_id');
        setIsAuthenticated(!!token && !!userId);
      } catch (error) {
        console.error('Error checking auth status:', error);
        setIsAuthenticated(false);
      }
    }
    
    checkAuth();
  }, []);
  
  // Show nothing while checking authentication
  if (isAuthenticated === null) {
    return null;
  }
  
  // Redirect based on authentication status
  if (isAuthenticated) {
    return <Redirect href="/(main)/home" />;
  }
  
  return <Redirect href="/(auth)/authenticate" />;
}