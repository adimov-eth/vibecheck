import { subscriptionApi } from '@/services/api/subscription';
import { type SubscriptionStatus } from '@/types/subscription';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSubscriptionStore } from './useTypedStore';

const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
const DEFAULT_GCTIME = 1000 * 60 * 60; // 1 hour

export const useSubscriptionStatus = (options?: UseQueryOptions<SubscriptionStatus, Error>) => {
  const { setSubscriptionStatus } = useSubscriptionStore();
  
  // Query for subscription status from the server
  const query = useQuery<SubscriptionStatus, Error>({
    queryKey: ['subscriptionStatus'],
    queryFn: () => subscriptionApi.getSubscriptionStatus(),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GCTIME,
    retry: 3,
    ...options,
  });

  // Update local store when server status changes
  useEffect(() => {
    if (query.data) {
      setSubscriptionStatus(
        query.data.isSubscribed,
        query.data.subscription.type,
        query.data.subscription.expiresDate,
      );
    }
  }, [query.data, setSubscriptionStatus]);

  return query;
};

export const useSubscription = () => {
  const {
    isSubscribed,
    subscriptionPlan,
    expiryDate,
    isLoading: storeLoading,
    error: storeError,
    subscriptionProducts,
    purchaseSubscription,
    restorePurchases,
    fetchSubscriptionProducts,
  } = useSubscriptionStore();

  const {
    data: serverStatus,
    isLoading: serverLoading,
    error: serverError,
    refetch: refetchStatus,
  } = useSubscriptionStatus();

  // Fetch products on mount
  useEffect(() => {
    void fetchSubscriptionProducts();
  }, [fetchSubscriptionProducts]);

  // Enhanced purchase function that refetches status
  const handlePurchase = useCallback(async (
    productId: string,
    offerToken?: string,
  ) => {
    const success = await purchaseSubscription(productId, offerToken);
    if (success) {
      await refetchStatus();
    }
    return success;
  }, [purchaseSubscription, refetchStatus]);

  // Enhanced restore function that refetches status
  const handleRestore = useCallback(async () => {
    const success = await restorePurchases();
    if (success) {
      await refetchStatus();
    }
    return success;
  }, [restorePurchases, refetchStatus]);

  return {
    // Subscription status
    isSubscribed,
    subscriptionPlan,
    expiryDate,
    serverStatus,

    // Available products
    subscriptionProducts,

    // Loading states
    isLoading: storeLoading || serverLoading,
    
    // Errors
    error: storeError || serverError,

    // Actions
    purchase: handlePurchase,
    restore: handleRestore,
    refetchStatus,
  };
}; 