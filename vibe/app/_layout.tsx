// /Users/adimov/Developer/final/vibe/app/_layout.tsx
import ErrorDisplay from '@/components/layout/ErrorDisplay';
import { ToastProvider } from "@/components/ui/Toast";
import useStore from '@/state';
import { registerBackgroundUploadTask } from '@/utils/background-upload';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const NavigationLayout = () => {
  const [appIsReady, setAppIsReady] = useState(false);
  // Select initializeUploads *after* ensuring the store is created correctly
  const initializeUploads = useStore(state => state.initializeUploads);

  useEffect(() => {
    async function prepare() {
      try {
        // Register background upload task
        await registerBackgroundUploadTask();

        // Add any other initialization logic here
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for smoother transition
      } catch (e) {
        console.warn('Error during app preparation:', e);
      } finally {
        setAppIsReady(true);
        SplashScreen.hideAsync();
      }
    }

    console.log("[RootLayout] Component mounted. Initializing uploads and registering background task...");

    // Check if initializeUploads is a function before calling
    if (typeof initializeUploads === 'function') {
      initializeUploads();
    } else {
      // This should not happen after fixing the store setup, but good to log if it does
      console.error("[RootLayout] initializeUploads function is not available in the store state!");
    }

    // Ensure the background task itself is registered
    registerBackgroundUploadTask();

    prepare();
  }, [initializeUploads]); // Keep dependency array, function reference should be stable

  if (!appIsReady) {
    return null;
  }
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#FFFFFF" },
        }}
      >
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            presentation: 'modal'
          }}
        />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <ErrorDisplay />
    </>
  );
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        <NavigationLayout />
        <ToastProvider />
      </View>
    </SafeAreaProvider>
  );
}