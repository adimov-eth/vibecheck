import { handleError } from "@/utils/errorUtils";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider, type Persister } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useUsage } from "@/hooks/useApi";
import { useSubscriptionStatus } from "@/hooks/useSubscription";
import "@/store/listeners";
import { ToastProvider } from "../components/ui/Toast";
import { networkService } from "../services/NetworkService";
import { queryClient, setupNetworkListeners } from "../services/QueryClient";
import { useStore } from "../store";

// React Query persistence configuration
const createQueryPersister = (): Persister => {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: "vibecheck-query-cache",
    serialize: (data) => {
      const filteredData = {
        ...data,
        clientState: {
          ...data.clientState,
          queries: data.clientState.queries.filter(
            (query) =>
              !query.queryKey.includes("auth") &&
              !query.queryKey.includes("token") &&
              query.state.status === "success"
          ),
        },
      };
      return JSON.stringify(filteredData);
    },
  });
};

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      handleError(err);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      handleError(err);
      return;
    }
  },
};

/**
 * Component to handle initialization logic
 */
interface AppInitializerProps {
  children: React.ReactNode;
}

const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const { isSignedIn, getToken } = useAuth();
  const { initializeApp, setLoggedIn } = useStore();
  const { refetch: refetchUsage } = useUsage({ enabled: false });
  const { refetch: refetchSubscriptionStatus } = useSubscriptionStatus({ enabled: false });

  useEffect(() => {
    let isMounted = true;

    const initializeServices = async () => {
      if (!isMounted) return;

      try {
        // Initialize app state
        await initializeApp();

        // Set up network monitoring
        networkService.init();
        setupNetworkListeners();

        // Handle authentication and data fetching
        if (isSignedIn) {
          const token = await getToken();
          setLoggedIn(true, token || undefined);

          // Wait a tick to ensure store updates propagate
          await new Promise(resolve => setTimeout(resolve, 0));

          // Fetch usage and subscription data
          await Promise.all([refetchUsage(), refetchSubscriptionStatus()]);
        } else {
          setLoggedIn(false);
        }
      } catch (error) {
        if (isMounted) {
          setLoggedIn(false);
          handleError(error);
        }
      }
    };

    initializeServices();

    return () => {
      isMounted = false;
    };
  }, [isSignedIn, getToken, initializeApp, setLoggedIn, refetchUsage, refetchSubscriptionStatus]);

  return children;
};

/**
 * Navigation layout component that handles the Stack navigation structure
 */
const NavigationLayout = () => {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    >
      <Stack.Screen name="(main)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
};

/**
 * Root layout component that sets up the app's providers and global context
 */
export default function RootLayout() {
  const persister = createQueryPersister();

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24, // 24 hours
          buster: "1.0.0",
        }}
      >
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <AppInitializer>
            <View style={{ flex: 1 }}>
              <NavigationLayout />
              <ToastProvider />
            </View>
          </AppInitializer>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </ClerkProvider>
  );
}