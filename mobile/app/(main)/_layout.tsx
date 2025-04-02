import { Stack, Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import * as SecureStore from 'expo-secure-store';

export default function MainLayout() {
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
  
  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/authenticate" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="home/index" />
      <Stack.Screen name="home/[id]" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/update-password" />
      <Stack.Screen name="recording" />
      <Stack.Screen name="results/[id]" />
      <Stack.Screen name="paywall" />
    </Stack>
  );
}