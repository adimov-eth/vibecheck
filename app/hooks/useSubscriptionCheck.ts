import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useSubscription } from '../contexts/SubscriptionContext';

/**
 * Hook for checking subscription status and guarding premium features
 */
export const useSubscriptionCheck = () => {
  const { isSubscribed, subscriptionInfo, checkSubscriptionStatus } = useSubscription();

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
    openSubscriptionSettings,
  };
}; 