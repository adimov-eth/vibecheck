import { tokenCache } from '@/cache'
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo'
import { Stack } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RecordingProvider } from '../contexts/RecordingContext'
import { AuthTokenProvider } from '../contexts/AuthTokenContext'
import { UserProvider } from '../contexts/UserContext'
import { SubscriptionProvider } from '../contexts/SubscriptionContext'
import { UsageProvider } from '../contexts/UsageContext'
import ToastComponent from '../components/Toast'
import { setupUploadQueue } from '../utils/backgroundUpload'
import { useEffect } from 'react'

// Default export is required by Expo Router
export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

  // Initialize background upload task on app startup
  useEffect(() => {
    // Setup upload queue system with cleanup and processing
    setupUploadQueue().catch(err => {
      console.error('Failed to setup upload queue:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <RecordingProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <ClerkLoaded>
            <AuthTokenProvider>
              <UserProvider>
                <UsageProvider>
                  <SubscriptionProvider>
                    <Stack screenOptions={{ 
                      headerShown: false, // Hide all headers by default
                      animation: 'slide_from_right' 
                    }}>
                      <Stack.Screen name="(auth)" options={{ headerShown: false }}/>
                      <Stack.Screen name="(home)" />
                      <Stack.Screen name="index" options={{ headerShown: false }} />
                    </Stack>
                    <ToastComponent />
                  </SubscriptionProvider>
                </UsageProvider>
              </UserProvider>
            </AuthTokenProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </RecordingProvider>
    </SafeAreaProvider>
  )
}