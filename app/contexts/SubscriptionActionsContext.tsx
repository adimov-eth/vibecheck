import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  purchaseErrorListener,
  purchaseUpdatedListener,
  finishTransaction,
  requestSubscription,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import { Platform } from 'react-native';
import { SUBSCRIPTION_SKUS } from '../types/subscription';

interface SubscriptionActionsContextType {
  subscriptionProducts: any[];
  isLoading: boolean;
  error: Error | null;
  purchaseSubscription: (productId: string, offerToken?: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const SubscriptionActionsContext = createContext<SubscriptionActionsContextType | undefined>(undefined);

export const SubscriptionActionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subscriptionProducts, setSubscriptionProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const purchaseUpdateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const purchaseErrorSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const connectToStore = async () => {
      try {
        await initConnection();

        purchaseUpdateSubscriptionRef.current = purchaseUpdatedListener(handlePurchaseUpdate);
        purchaseErrorSubscriptionRef.current = purchaseErrorListener(handlePurchaseError);

        setIsLoading(true);
        const products = await getSubscriptions({ skus: Object.values(SUBSCRIPTION_SKUS) });
        setSubscriptionProducts(products);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to connect to store'));
        setIsLoading(false);
      }
    };

    connectToStore();

    return () => {
      if (purchaseUpdateSubscriptionRef.current) {
        purchaseUpdateSubscriptionRef.current.remove();
      }
      if (purchaseErrorSubscriptionRef.current) {
        purchaseErrorSubscriptionRef.current.remove();
      }
      endConnection();
    };
  }, []);

  const handlePurchaseUpdate = async (purchase: Purchase) => {
    const receipt = purchase.transactionReceipt;
    if (receipt) {
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch (err) {
        console.error('Error processing purchase:', err);
      }
    }
  };

  const handlePurchaseError = (error: PurchaseError) => {
    console.error('Purchase error:', error);
    setError(new Error(error.message));
  };

  const purchaseSubscription = async (productId: string, offerToken?: string) => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'ios') {
        await requestSubscription({
          sku: productId,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        });
      } else {
        await requestSubscription({
          sku: productId,
          ...(offerToken && { subscriptionOffers: [{ sku: productId, offerToken }] }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to purchase subscription'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const restorePurchases = async () => {
    // Restoration handled by components via refetching subscription status
  };

  return (
    <SubscriptionActionsContext.Provider
      value={{
        subscriptionProducts,
        isLoading,
        error,
        purchaseSubscription,
        restorePurchases,
      }}
    >
      {children}
    </SubscriptionActionsContext.Provider>
  );
};

export const useSubscriptionActions = () => {
  const context = useContext(SubscriptionActionsContext);
  if (context === undefined) {
    throw new Error('useSubscriptionActions must be used within a SubscriptionActionsProvider');
  }
  return context;
};