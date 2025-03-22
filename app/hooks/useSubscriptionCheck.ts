import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useUsage } from '../contexts/UsageContext';
import { router } from 'expo-router';

/**
 * Hook for checking subscription status and guarding premium features
 */
export const useSubscriptionCheck = () => {
  const { isSubscribed, subscriptionInfo, checkSubscriptionStatus } = useSubscription();
  const { usageStats, refreshUsage } = useUsage();

  /**
   * Check if user can access premium features
   * @param showAlert Whether to show an alert if user is not subscribed
   * @param onSubscribePress Callback function to handle navigation to paywall
   * @returns True if user can access premium features
   */
  const canAccessPremiumFeature = useCallback(
    async (showAlert = true, onSubscribePress?: () => void): Promise<boolean> => {
      // Check subscription status
      const hasActiveSubscription = await checkSubscriptionStatus();

      if (!hasActiveSubscription) {
        if (showAlert) {
          Alert.alert(
            'Premium Feature',
            'This feature is only available to premium subscribers.',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Subscribe Now',
                onPress: () => {
                  if (onSubscribePress) {
                    onSubscribePress();
                  } else {
                    router.push('/paywall' as any);
                  }
                },
              },
            ],
            { cancelable: true }
          );
        }
        return false;
      }

      return true;
    },
    [checkSubscriptionStatus]
  );

  /**
   * Get subscription details for display
   */
  const getSubscriptionDetails = useCallback(() => {
    if (!isSubscribed || !subscriptionInfo) {
      return {
        isSubscribed: false,
        type: null,
        expiryDate: null,
        formattedExpiryDate: null,
      };
    }

    // Format expiry date
    const formattedExpiryDate = subscriptionInfo.expiryDate
      ? new Date(subscriptionInfo.expiryDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    return {
      isSubscribed: true,
      type: subscriptionInfo.type,
      expiryDate: subscriptionInfo.expiryDate,
      formattedExpiryDate,
    };
  }, [isSubscribed, subscriptionInfo]);

  /**
   * Get usage statistics for display
   */
  const getUsageStats = useCallback(() => {
    // Refresh usage stats when requested
    refreshUsage();

    // Format reset date for display
    const formattedResetDate = usageStats?.resetDate
      ? new Date(usageStats.resetDate).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })
      : 'next month';

    return {
      currentUsage: usageStats?.currentUsage || 0,
      limit: usageStats?.limit || 10,
      isSubscribed: usageStats?.isSubscribed || false,
      remainingConversations: usageStats?.remainingConversations || 0,
      resetDate: usageStats?.resetDate || null,
      formattedResetDate,
      limitReached: usageStats?.remainingConversations === 0 && !usageStats?.isSubscribed,
      usageText: usageStats?.isSubscribed
        ? 'Unlimited'
        : usageStats?.remainingConversations 
          ? `${usageStats.remainingConversations} left this month`
          : 'No free conversations left',
      progressPercentage: usageStats?.limit ? 
        Math.min(100, (usageStats.currentUsage / usageStats.limit) * 100) : 0
    };
  }, [usageStats, refreshUsage]);

  /**
   * Open subscription management in App Store settings
   */
  const openSubscriptionSettings = useCallback(() => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }, []);

  return {
    isSubscribed,
    subscriptionInfo,
    canAccessPremiumFeature,
    getSubscriptionDetails,
    getUsageStats,
    openSubscriptionSettings,
  };
}; 