import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ClerkProvider } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthTokenProvider } from './providers/AuthTokenProvider';

// Import any env variables or configs
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/**
 * Root layout component that sets up the app's providers and global context
 */
export default function RootLayout() {
  // Ensure the app is properly configured
  useEffect(() => {
    if (!clerkPublishableKey) {
      console.error('Missing Clerk publishable key');
    }
  }, []);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {/* AuthTokenProvider centralizes token management to prevent multiple instances */}
      <AuthTokenProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#fff',
              },
              headerTintColor: '#000',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </SafeAreaProvider>
      </AuthTokenProvider>
    </ClerkProvider>
  );
} 