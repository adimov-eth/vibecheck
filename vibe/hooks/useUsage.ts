// /Users/adimov/Developer/final/vibe/hooks/useUsage.ts
import { ApiError, AuthenticationError } from '@/utils/apiClient'; // Import custom errors
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import useStore from '../state';
import { formatDate } from '../utils/date';
import { useAuthentication } from './useAuthentication'; // Import useAuthentication

export const useUsage = () => {
  const { getUsageStats, checkSubscriptionStatus, usageStats, subscriptionStatus } = useStore();
  const { signOut } = useAuthentication(); // Get signOut function
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Store error message string
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadData = useCallback(async () => {
    if (loadingRef.current || !mountedRef.current) return; // Check mounted state
    setLoading(true);
    loadingRef.current = true;
    setError(null); // Clear previous errors
    try {
      console.log('[useUsage] Loading usage and subscription data...');
      await Promise.all([getUsageStats(), checkSubscriptionStatus()]);
      console.log('[useUsage] Data loaded successfully.');
    } catch (err) {
      console.error('[useUsage] Error loading data:', err);
      if (mountedRef.current) { // Check mounted state again before setting state
        if (err instanceof AuthenticationError) {
          setError("Your session has expired. Please sign in again.");
          await signOut(); // Trigger sign out
        } else if (err instanceof ApiError) {
           setError(`Failed to load data: ${err.message} (Status: ${err.status})`);
        } else {
          setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      }
    } finally {
      if (mountedRef.current) { // Check mounted state before setting state
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, [getUsageStats, checkSubscriptionStatus, signOut]); // Add signOut dependency

  useEffect(() => {
    mountedRef.current = true;
    // Load data only if needed and not already loading
    if ((!usageStats || !subscriptionStatus) && !loadingRef.current) {
      loadData();
    }
    return () => {
      mountedRef.current = false; // Cleanup mounted state
    };
  }, [loadData, usageStats, subscriptionStatus]); // Add usageStats/subscriptionStatus to re-check if they become null

  const checkCanCreateConversation = useCallback(async (): Promise<boolean> => {
    // Ensure data is loaded before checking, or trigger load if missing
    if (!usageStats || !subscriptionStatus) {
        if (!loadingRef.current) {
            console.log('[useUsage] Usage/Subscription data missing, attempting to load before check...');
            await loadData(); // Wait for loadData to complete
            // Re-check the store state after loading
            const currentStats = useStore.getState().usageStats;
            if (!currentStats) {
                 // If still no stats after loading (likely due to error handled in loadData), deny creation
                 console.warn('[useUsage] Failed to load usage stats. Denying conversation creation.');
                 // Error should already be set by loadData, maybe show a toast?
                 return false;
            }
             // If loaded successfully, proceed with the check using the fresh stats
             if (currentStats.isSubscribed || currentStats.remainingConversations > 0) return true;
        } else {
            // If already loading, deny creation for now
            console.log('[useUsage] Usage/Subscription data is loading. Denying conversation creation temporarily.');
            return false;
        }
    } else {
         // Data exists, perform the check directly
         if (usageStats.isSubscribed || usageStats.remainingConversations > 0) return true;
    }


    // If we reach here, user is not subscribed and has no remaining conversations
    Alert.alert(
      'Free Conversations Used', // Updated title
      `You've used all your free conversations for this period. They will reset on ${formatDate(
        usageStats?.resetDate ?? Date.now() // Use current date as fallback
      )}.\n\nUpgrade to Premium for unlimited conversations.`,
      [
        { text: 'Maybe Later', style: 'cancel' },
        {
          text: 'Upgrade Now',
          onPress: () => {
            router.push('/(main)/paywall'); // Ensure paywall route is correct
          },
        },
      ]
    );
    return false;
  }, [usageStats, subscriptionStatus, loadData]); // Add loadData dependency

  return {
    loading,
    error, // Expose the error message
    usageStats,
    subscriptionStatus,
    checkCanCreateConversation,
    loadData,
  };
};