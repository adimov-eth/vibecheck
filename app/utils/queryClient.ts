/**
 * Custom React Query client configuration with enhanced error handling
 */
import { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

/**
 * Custom retry function that considers network connectivity
 */
const customRetry = async (failureCount: number, error: unknown): Promise<boolean> => {
  // Don't retry if we've hit the maximum retries
  if (failureCount >= 3) return false;
  
  // Handle network errors specially
  // @ts-ignore - Using our custom property from apiClient
  if (error instanceof Error && error.isNetworkError) {
    // Check if we're online before retrying
    try {
      const netInfoState = await NetInfo.fetch();
      return Boolean(netInfoState.isConnected);
    } catch (e) {
      // If we can't check connectivity, default to retry
      console.error('Error checking network connectivity:', e);
      return true;
    }
  }
  
  // Default retry behavior for other errors
  return true;
};

/**
 * Create a configured QueryClient instance
 */
export const createQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // @ts-ignore - React Query expects a boolean but we're using an async function
        retry: customRetry,
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
};

// Export a singleton instance for use throughout the app
export const queryClient = createQueryClient(); 