import { handleError } from "@/utils/errorUtils";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Slot, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ToastProvider } from "../components/ui/Toast";
import { networkService } from "../services/NetworkService";
import { queryClient, setupNetworkListeners } from "../services/QueryClient";
import { useStore } from "../store";

// React Query persistence configuration
const createQueryPersister = () =>
  createAsyncStoragePersister({
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

  useEffect(() => {
    const initializeServices = async () => {
      // Initialize app state
      await initializeApp();

      // Initialize network monitoring
      networkService.init();

      // Set up React Query network listeners
      setupNetworkListeners();

      // Set authentication state based on Clerk's auth state
      if (isSignedIn) {
        try {
          const token = await getToken();
          setLoggedIn(true, token || undefined);
        } catch (error) {
          setLoggedIn(false);
          handleError(error);
        }
      } else {
        setLoggedIn(false);
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      networkService.cleanup();
    };
  }, [initializeApp, setLoggedIn, isSignedIn, getToken]);

  return <>{children}</>;
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
          buster: "1.0.0", // Update when app version changes
        }}
        onSuccess={() => {
          console.log("React Query cache restored from persistence");
        }}
      >
        {__DEV__ && <ReactQueryDevtools initialIsOpen={false} />}
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <AppInitializer>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#FFFFFF" },
              }}
            >
              <Slot />
            </Stack>
          </AppInitializer>
          <ToastProvider />
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </ClerkProvider>
  );
}