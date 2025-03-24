import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

import { networkService } from "./NetworkService";

/**
 * Custom retry function that considers network status
 */
const customRetryFn = (
  failureCount: number,
  error: Error & { isAuthError?: boolean }
): boolean => {
  // Don't retry more than 3 times
  if (failureCount >= 3) return false;

  // Don't retry auth errors
  if (error?.isAuthError) return false;

  // Always retry other errors
  return true;
};

/**
 * Default query options
 */
const defaultQueryOptions: DefaultOptions = {
  queries: {
    retry: customRetryFn,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  mutations: {
    // Don't retry mutations by default
    retry: false,
    onError: (error) => {
      console.error("Mutation error:", error);
    },
  },
};

/**
 * Create a new QueryClient instance with default configuration
 */
export const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: defaultQueryOptions,
  });
};

/**
 * Default QueryClient instance (singleton)
 */
export const queryClient = createQueryClient();

/**
 * Resets the query client - useful for testing or after logout
 */
export const resetQueryClient = () => {
  queryClient.clear();
};

/**
 * Network status event handler for React Query
 * Refetches stale queries when network is restored
 */
export const setupNetworkListeners = () => {
  networkService.addListener((status) => {
    if (status.isConnected && status.isInternetReachable) {
      // When network is restored, refetch any stale queries
      queryClient.invalidateQueries({
        predicate: (query) => query.state.status === "error" || query.isStale(),
      });
    }
  });
};
