// /Users/adimov/Developer/final/vibe/state/slices/subscriptionSlice.ts
import { fetchWithAuth } from '@/utils/apiClient'; // Use the new API client
import { Platform } from 'react-native';
import {
  endConnection,
  finishTransaction,
  getSubscriptions,
  initConnection,
  type Purchase,
  type PurchaseError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  type Subscription,
  type SubscriptionAndroid,
  type SubscriptionIOS,
} from 'react-native-iap';
import type { StateCreator } from 'zustand';
import type { StoreState, SubscriptionResponse, SubscriptionSlice, UsageResponse, UsageStats } from '../types'; // Import response types

// Removed: API_URL constant, handled by apiClient

export const SUBSCRIPTION_SKUS = {
  MONTHLY: '2a',
  YEARLY: '2b',
} as const;

// Platform-specific subscription product interface
export interface PlatformSubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  localizedPrice?: string; // iOS specific
  subscriptionOfferDetails?: Array<{
    offerToken: string;
    // Add other offer details as needed
  }>;
}

// Type guards for platform-specific products
function isIOSSubscription(product: Subscription): product is SubscriptionIOS {
  return Platform.OS === 'ios';
}

function isAndroidSubscription(product: Subscription): product is SubscriptionAndroid {
  return Platform.OS === 'android';
}

export const createSubscriptionSlice: StateCreator<
  StoreState,
  [],
  [],
  SubscriptionSlice
> = (set, get) => {
  let purchaseUpdateSubscription: { remove: () => void } | null = null;
  let purchaseErrorSubscription: { remove: () => void } | null = null;

  const handlePurchaseUpdate = async (purchase: Purchase) => {
    const receipt = purchase.transactionReceipt;
    if (receipt) {
      try {
        // Finish transaction FIRST
        await finishTransaction({ purchase, isConsumable: false });
        // Then verify with backend
        const result = await get().verifySubscription(receipt);
        // Update state based on verified backend status
        set({ subscriptionStatus: result.subscription });
        // Optionally refresh usage stats after successful verification
        await get().getUsageStats();
      } catch (err) {
        console.error('[SubscriptionSlice] Error processing purchase update:', err);
        // Don't set subscriptionError here, let verifySubscription handle it
        // If finishTransaction fails, IAP might retry. If verify fails, error is handled there.
      }
    } else {
        console.warn('[SubscriptionSlice] Purchase update received without transactionReceipt:', purchase);
    }
  };

  const handlePurchaseError = (error: PurchaseError) => {
    console.error('[SubscriptionSlice] Purchase error listener:', error);
    // Set error state for UI feedback, potentially clear loading state
    set({
        subscriptionError: new Error(`Purchase failed: ${error.message} (Code: ${error.code})`),
        subscriptionLoading: false // Ensure loading is stopped on error
    });
  };

  // Removed: getAuthToken helper, handled by fetchWithAuth

  return {
    subscriptionStatus: null,
    usageStats: null,
    subscriptionProducts: [] as PlatformSubscriptionProduct[],
    subscriptionLoading: false,
    subscriptionError: null,

    verifySubscription: async (receiptData: string): Promise<SubscriptionResponse> => {
      console.log('[SubscriptionSlice:verifySubscription] Verifying receipt...');
      set({ subscriptionLoading: true, subscriptionError: null });
      try {
        const data = await fetchWithAuth<SubscriptionResponse>( // Use fetchWithAuth
          '/subscriptions/verify',
          {
            method: 'POST',
            body: JSON.stringify({ receiptData }),
          }
        );
        console.log('[SubscriptionSlice:verifySubscription] Verification successful:', data.subscription);
        set({ subscriptionStatus: data.subscription });
        return data;
      } catch (error) {
        console.error('[SubscriptionSlice:verifySubscription] Verification failed:', error);
        // Let the calling hook handle the error (including AuthenticationError)
        set({ subscriptionError: error instanceof Error ? error : new Error('Verification failed') });
        throw error;
      } finally {
        set({ subscriptionLoading: false });
      }
    },

    checkSubscriptionStatus: async (): Promise<SubscriptionResponse> => {
      console.log('[SubscriptionSlice:checkSubscriptionStatus] Checking status...');
      // No loading state set here, usually part of a larger load sequence
      try {
        const data = await fetchWithAuth<SubscriptionResponse>( // Use fetchWithAuth
          '/subscriptions/status'
        );
        console.log('[SubscriptionSlice:checkSubscriptionStatus] Status check successful:', data.subscription);
        set({ subscriptionStatus: data.subscription });
        return data;
      } catch (error) {
        console.error('[SubscriptionSlice:checkSubscriptionStatus] Status check failed:', error);
        // Let the calling hook handle the error (including AuthenticationError)
        // Don't set error state here if called during initialization, let initializeStore handle it
        throw error;
      }
    },

    getUsageStats: async (): Promise<UsageResponse> => {
      console.log('[SubscriptionSlice:getUsageStats] Fetching usage stats...');
      // No loading state set here, usually part of a larger load sequence
      try {
        const data = await fetchWithAuth<UsageResponse>( // Use fetchWithAuth
          '/users/usage'
        );
        if (!data.usage) {
          console.error("[SubscriptionSlice:getUsageStats] Invalid response structure: 'usage' key missing.", data);
          throw new Error('Invalid usage data received from server');
        }
        console.log('[SubscriptionSlice:getUsageStats] Success. Usage:', data.usage);
        set({ usageStats: data.usage });
        return data;
      } catch (error) {
        console.error('[SubscriptionSlice:getUsageStats] Error fetching usage stats:', error);
        // Let the calling hook handle the error (including AuthenticationError)
        // Don't set error state here if called during initialization, let initializeStore handle it
        throw error;
      }
    },

    initializeStore: async () => {
      console.log('[SubscriptionSlice:initializeStore] Starting initialization...');
      set({ subscriptionLoading: true, subscriptionError: null });

      try {
        console.log('[SubscriptionSlice:initializeStore] Initializing IAP connection...');
        await initConnection();
        console.log('[SubscriptionSlice:initializeStore] IAP connection initialized.');

        // Remove existing listeners before adding new ones
        if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
        if (purchaseErrorSubscription) purchaseErrorSubscription.remove();

        purchaseUpdateSubscription = purchaseUpdatedListener(handlePurchaseUpdate);
        purchaseErrorSubscription = purchaseErrorListener(handlePurchaseError);
        console.log('[SubscriptionSlice:initializeStore] Purchase listeners attached.');

        const skus = Object.values(SUBSCRIPTION_SKUS);
        console.log('[SubscriptionSlice:initializeStore] Fetching subscription products:', skus);

        const rawProducts = await getSubscriptions({ skus });
        console.log(`[SubscriptionSlice:initializeStore] Found ${rawProducts.length} raw products.`);

        const mappedProducts: PlatformSubscriptionProduct[] = rawProducts.map((product): PlatformSubscriptionProduct => {
            let price = 'N/A';
            let offerDetails: PlatformSubscriptionProduct['subscriptionOfferDetails'] | undefined = undefined;

            if (isIOSSubscription(product)) {
              price = String(product.price ?? 'N/A');
            } else if (isAndroidSubscription(product)) {
              price = String(product.price ?? 'N/A');
              offerDetails = product.subscriptionOfferDetails?.map(offer => ({
                offerToken: offer.offerToken,
              }));
            }

            return {
              productId: product.productId,
              title: product.title,
              description: product.description,
              price,
              ...(isIOSSubscription(product) && { localizedPrice: String(product.price) }),
              ...(isAndroidSubscription(product) && { subscriptionOfferDetails: offerDetails }),
            };
          });

        console.log('[SubscriptionSlice:initializeStore] Mapped products:', mappedProducts);
        set({ subscriptionProducts: mappedProducts });

        console.log('[SubscriptionSlice:initializeStore] Checking initial subscription status and usage stats...');
        // Perform these sequentially to ensure auth works before proceeding
        await get().checkSubscriptionStatus();
        await get().getUsageStats();

        console.log('[SubscriptionSlice:initializeStore] Initialization completed successfully.');

      } catch (err) {
        console.error('[SubscriptionSlice:initializeStore] Initialization failed:', err);
        // Set error state here for initialization failures
        set({
          subscriptionError: err instanceof Error ? err : new Error('Failed to initialize store'),
        });
        // Re-throw the error so the calling hook can handle it (e.g., trigger sign out if auth error)
        throw err;
      } finally {
        set({ subscriptionLoading: false });
      }
    },

    cleanupStore: () => {
      console.log('[SubscriptionSlice:cleanupStore] Cleaning up listeners and connection.');
      if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
      if (purchaseErrorSubscription) purchaseErrorSubscription.remove();
      purchaseUpdateSubscription = null;
      purchaseErrorSubscription = null;
      endConnection();
    },

    purchaseSubscription: async (productId: string, offerToken?: string) => {
      console.log(`[SubscriptionSlice:purchaseSubscription] Requesting purchase for Product ID: ${productId}, Offer Token: ${offerToken || 'N/A'}`);
      set({ subscriptionLoading: true, subscriptionError: null }); // Set loading, clear error
      try {
        await requestSubscription({
          sku: productId,
          // Conditionally add subscriptionOffers for Android
          ...(Platform.OS === 'android' && offerToken && {
            subscriptionOffers: [{ sku: productId, offerToken }],
          }),
          // For iOS, use this to prevent automatic finishing before verification
          ...(Platform.OS === 'ios' && {
            andDangerouslyFinishTransactionAutomaticallyIOS: false,
          }),
        });
        // Loading state will be cleared by the listener (success or error)
        console.log(`[SubscriptionSlice:purchaseSubscription] Purchase request initiated for ${productId}. Waiting for listener...`);
      } catch (err) {
        // This catch block might handle immediate request errors (e.g., product not found by IAP)
        console.error(`[SubscriptionSlice:purchaseSubscription] Error initiating purchase request for ${productId}:`, err);
        const error = err instanceof Error ? err : new Error('Failed to initiate purchase');
        set({ subscriptionError: error, subscriptionLoading: false }); // Set error, clear loading
        throw error; // Re-throw for potential UI handling
      }
    },

    restorePurchases: async () => {
      console.log('[SubscriptionSlice:restorePurchases] Attempting to restore purchases by checking status...');
      set({ subscriptionLoading: true, subscriptionError: null });
      try {
        // Restoring essentially means re-checking the status with the backend
        await get().checkSubscriptionStatus();
        // Optionally refresh usage stats after successful restore/status check
        await get().getUsageStats();
        console.log('[SubscriptionSlice:restorePurchases] Restore check completed.');
      } catch (err) {
        console.error('[SubscriptionSlice:restorePurchases] Restore check failed:', err);
        set({
          subscriptionError: err instanceof Error ? err : new Error('Failed to restore purchases'),
        });
        // Re-throw so the calling hook can handle it (e.g., sign out on auth error)
        throw err;
      } finally {
        set({ subscriptionLoading: false });
      }
    },

    // This seems redundant if getUsageStats is called during init/restore
    // Keep if needed for specific scenarios
    setInitialUsageStats: (stats: UsageStats) => {
      console.log('[SubscriptionSlice:setInitialUsageStats] Setting initial usage stats (external source):', stats);
      set({ usageStats: stats });
    },
  };
};