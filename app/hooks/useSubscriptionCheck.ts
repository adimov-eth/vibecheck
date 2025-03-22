import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useSubscriptionStatus, useUsageStats } from '../hooks/useApiQueries';
import { router } from 'expo-router';

export const useSubscriptionCheck = () => {
  const { data: subscriptionStatus, refetch: checkSubscriptionStatus } = useSubscriptionStatus();
  const { data: usageStats, refetch: refreshUsage } = useUsageStats();

  const canAccessPremiumFeature = useCallback(
    async (showAlert = true, onSubscribePress?: () => void): Promise<boolean> => {
      await checkSubscriptionStatus();
      const hasActiveSubscription = subscriptionStatus?.isSubscribed ?? false;

      if (!hasActiveSubscription && showAlert) {
        Alert.alert(
          'Premium Feature',
          'This feature is only available to premium subscribers.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Subscribe Now',
              onPress: () => (onSubscribePress ? onSubscribePress() : router.push('/paywall' as any)),
            },
          ],
          { cancelable: true }
        );
      }
      return hasActiveSubscription;
    },
    [checkSubscriptionStatus, subscriptionStatus]
  );

  const getSubscriptionDetails = useCallback(() => {
    if (!subscriptionStatus?.isSubscribed || !subscriptionStatus?.subscription) {
      return { isSubscribed: false, type: null, expiryDate: null, formattedExpiryDate: null };
    }
    const formattedExpiryDate = subscriptionStatus.subscription.expiresDate
      ? new Date(subscriptionStatus.subscription.expiresDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;
    return {
      isSubscribed: true,
      type: subscriptionStatus.subscription.type,
      expiryDate: subscriptionStatus.subscription.expiresDate,
      formattedExpiryDate,
    };
  }, [subscriptionStatus]);

  const getUsageStats = useCallback(() => {
    refreshUsage();
    const formattedResetDate = usageStats?.resetDate
      ? new Date(usageStats.resetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
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
      progressPercentage: usageStats?.limit
        ? Math.min(100, (usageStats.currentUsage / usageStats.limit) * 100)
        : 0,
    };
  }, [usageStats, refreshUsage]);

  const openSubscriptionSettings = useCallback(() => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }, []);

  return {
    isSubscribed: subscriptionStatus?.isSubscribed ?? false,
    subscriptionInfo: subscriptionStatus?.subscription ?? null,
    canAccessPremiumFeature,
    getSubscriptionDetails,
    getUsageStats,
    openSubscriptionSettings,
  };
};