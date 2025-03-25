import { useEffect } from 'react';
import useStore from '../state/index';

export const useSubscription = () => {
  const {
    subscriptionProducts,
    subscriptionLoading: isLoading,
    subscriptionError: error,
    subscriptionStatus,
    initializeStore,
    cleanupStore,
    purchaseSubscription: purchase,
    restorePurchases: restore,
  } = useStore();

  useEffect(() => {
    initializeStore();
    return () => {
      cleanupStore();
    };
  }, [initializeStore, cleanupStore]);

  return {
    isSubscribed: subscriptionStatus?.active ?? false,
    subscriptionProducts,
    purchase,
    restore,
    isLoading,
    error,
  };
}; 