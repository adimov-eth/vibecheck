import { useCallback } from 'react';
import { useSubscriptionStatus, useUsageStats } from './useApiQueries';
import { showToast } from '../components/Toast';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';

export interface UsageHook {
  checkCanCreateConversation: (showAlert?: boolean) => Promise<boolean>;
  usageStats: {
    isSubscribed: boolean;
    remainingConversations: number;
  } | null;
  isOffline: boolean;
  isLoading: boolean;
  refreshUsage: () => Promise<unknown>;
}

export function useUsage(): UsageHook {
  // Use React Query's hooks with their built-in state management
  const { 
    data: subscriptionStatus, 
    isLoading: isLoadingSubscription 
  } = useSubscriptionStatus();
  
  const { 
    data: usageStats, 
    refetch: refreshUsage, 
    isLoading: isLoadingUsage,
    error: usageError,
    isError: hasUsageError
  } = useUsageStats();
  
  // Use NetInfo hook for network state
  const netInfo = useNetInfo();
  const isOffline = !netInfo.isConnected;
  
  const isSubscribed = subscriptionStatus?.isSubscribed || false;
  const isLoading = isLoadingSubscription || isLoadingUsage;
  
  const checkCanCreateConversation = useCallback(async (showAlert = false): Promise<boolean> => {
    // If offline, allow creating conversation with a warning
    if (isOffline) {
      if (showAlert) {
        showToast.networkError(
          'Offline Mode', 
          'Creating conversation while offline. Your usage may be limited when reconnected.'
        );
      }
      // In offline mode, allow creation but warn user
      return true;
    }
    
    try {
      // Refresh usage data to ensure we have the latest
      await refreshUsage();
      
      if (isSubscribed) {
        return true;
      }
      
      if (!usageStats) {
        // If loading is still in progress, show appropriate message
        if (isLoading) {
          if (showAlert) {
            showToast.success(
              'Checking Usage', 
              'Your usage limits are being verified. You may proceed.'
            );
          }
          return true;
        }
        
        // If error occurred, show error message
        if (hasUsageError) {
          if (showAlert) {
            showToast.networkError(
              'Usage Data Error', 
              'Unable to verify your usage limits. You may be charged later.'
            );
          }
          console.error('Error checking usage limits:', usageError);
          return true;
        }
        
        // If no data after refresh, allow with warning
        if (showAlert) {
          showToast.networkError(
            'Usage Data Unavailable', 
            'Unable to verify your usage limits. You may be charged later.'
          );
        }
        return true;
      }
      
      if (usageStats.remainingConversations <= 0) {
        if (showAlert) {
          showToast.error(
            'Usage Limit Reached', 
            'You have used all your free conversations. Upgrade for more.'
          );
          router.push('/paywall' as any);
        }
        return false;
      }
      
      return true;
    } catch (error) {
      // Handle unexpected errors
      if (showAlert) {
        showToast.networkError(
          'Network Error', 
          'Unable to check usage limits due to network issues. You may be charged later.'
        );
      }
      console.error('Error checking usage limits:', error);
      return true;
    }
  }, [isSubscribed, usageStats, refreshUsage, isOffline, isLoading, hasUsageError, usageError]);
  
  const formattedUsageStats = usageStats ? {
    isSubscribed,
    remainingConversations: usageStats.remainingConversations
  } : null;
  
  return {
    checkCanCreateConversation,
    usageStats: formattedUsageStats,
    isOffline,
    isLoading,
    refreshUsage
  };
} 