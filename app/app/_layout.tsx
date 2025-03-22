import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenCache } from '../cache';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RecordingProvider } from '../contexts/RecordingContext';
import { SubscriptionActionsProvider } from '../contexts/SubscriptionActionsContext';
import { AuthTokenProvider } from '../providers/AuthTokenProvider';
import ToastComponent from '../components/Toast';
import { setupUploadQueue } from '../utils/backgroundUpload';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Cache lasts 10 minutes
    },
  },
});

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

  useEffect(() => {
    setupUploadQueue().catch((err) => {
      console.error('Failed to setup upload queue:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <RecordingProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <SubscriptionActionsProvider>
                <AuthTokenProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  >
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="(home)" />
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                  </Stack>
                  <ToastComponent />
                </AuthTokenProvider>
              </SubscriptionActionsProvider>
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </RecordingProvider>
    </SafeAreaProvider>
  );
}