import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import useStore from "../state/index";

export const useUsage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { 
    subscriptionStatus, 
    usageStats, 
    getUsageStats, 
    checkSubscriptionStatus 
  } = useStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        if (!usageStats) {
          await getUsageStats();
        }
        if (!subscriptionStatus) {
          await checkSubscriptionStatus();
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load usage data'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [usageStats, subscriptionStatus, getUsageStats, checkSubscriptionStatus]);

  const checkCanCreateConversation = useCallback(async (showAlert = true) => {
    try {
      await checkSubscriptionStatus();
      await getUsageStats();
      
      if (!subscriptionStatus?.active) {
        if (showAlert) {
          Alert.alert(
            'Subscription Required',
            'Please subscribe to continue using VibeCheck.',
            [{ text: 'OK' }]
          );
        }
        return false;
      }

      if (usageStats && usageStats.remainingMinutes <= 0) {
        if (showAlert) {
          Alert.alert(
            'Usage Limit Reached',
            'You have reached your usage limit for this billing period.',
            [{ text: 'OK' }]
          );
        }
        return false;
      }

      return true;
    } catch {
      if (showAlert) {
        Alert.alert(
          'Error',
          'Failed to verify usage limits. Please try again.',
          [{ text: 'OK' }]
        );
      }
      return false;
    }
  }, [subscriptionStatus, usageStats, checkSubscriptionStatus, getUsageStats]);

  return {
    subscriptionStatus,
    usageStats,
    checkCanCreateConversation,
    isLoading,
    error,
  };
}; 