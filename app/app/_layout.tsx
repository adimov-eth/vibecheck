import { tokenCache } from '@/cache'
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo'
import { Stack } from 'expo-router'
import { RecordingProvider } from '../contexts/RecordingContext'
import { AuthTokenProvider } from '../contexts/AuthTokenContext'
import ToastComponent from '../components/Toast'

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

  return (
      <RecordingProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <ClerkLoaded>
            <AuthTokenProvider>
              <Stack screenOptions={{ 
                headerShown: false, // Hide all headers by default
                animation: 'slide_from_right' 
              }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(home)" />
                <Stack.Screen name="index" options={{ headerShown: false }} />
              </Stack>
              <ToastComponent />
            </AuthTokenProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </RecordingProvider>
  )
}