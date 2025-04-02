import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export default function AuthLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    async function checkAuthStatus() {
      try {
        // Check if we have a valid Apple identity token stored
        const token = await SecureStore.getItemAsync('apple_identity_token');
        const userId = await SecureStore.getItemAsync('user_id');
        
        setIsAuthenticated(!!token && !!userId);
      } catch (error) {
        console.error('Error checking authentication status:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    checkAuthStatus();
  }, []);
  
  // Show loading state
  if (isLoading) {
    return null;
  }
  
  // Redirect to home if already authenticated
  if (isAuthenticated) {
    return <Redirect href="/(main)/home" />;
  }
  
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="authenticate" />
    </Stack>
  );
}