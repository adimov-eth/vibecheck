import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  getAvailablePurchases,
  getPurchaseHistory,
  purchaseErrorListener,
  purchaseUpdatedListener,
  finishTransaction,
  ProductPurchase,
  SubscriptionPurchase,
  PurchaseError,
  requestSubscription,
} from 'react-native-iap';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApi } from '../hooks/useAPI';

// Define subscription product IDs
export const SUBSCRIPTION_SKUS = {
  MONTHLY: 'com.vibecheck.subscription.monthly',
  YEARLY: 'com.vibecheck.subscription.yearly',
};

export type SubscriptionType = 'monthly' | 'yearly' | null;

interface SubscriptionInfo {
  isActive: boolean;
  type: SubscriptionType;
  expiryDate: Date | null;
  lastVerified: Date;
}

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionInfo: SubscriptionInfo | null;
  subscriptionProducts: any[];
  isLoading: boolean;
  error: Error | null;
  checkSubscriptionStatus: () => Promise<boolean>;
  purchaseSubscription: (productId: string, offerToken?: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
}

// Default context value
const defaultContextValue: SubscriptionContextType = {
  isSubscribed: false,
  subscriptionInfo: null,
  subscriptionProducts: [],
  isLoading: false,
  error: null,
  checkSubscriptionStatus: async () => false,
  purchaseSubscription: async () => {},
  restorePurchases: async () => {},
};

const SubscriptionContext = createContext<SubscriptionContextType>(defaultContextValue);

// Storage key for caching subscription info
const SUBSCRIPTION_CACHE_KEY = '@vibecheck:subscription_info';

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [subscriptionProducts, setSubscriptionProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Connection state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  // Purchase listeners
  let purchaseUpdateSubscription: { remove: () => void } | null = null;
  let purchaseErrorSubscription: { remove: () => void } | null = null;

  // Initialize connection to store
  useEffect(() => {
    const connectToStore = async () => {
      try {
        await initConnection();
        setIsConnected(true);
        
        // Set up purchase listeners
        purchaseUpdateSubscription = purchaseUpdatedListener(handlePurchaseUpdate);
        purchaseErrorSubscription = purchaseErrorListener(handlePurchaseError);
        
        // Load cached subscription info
        loadCachedSubscriptionInfo();
        
        // Fetch available subscription products
        fetchSubscriptionProducts();
        
        // Check subscription status
        checkSubscriptionStatus();
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to connect to store'));
      }
    };

    connectToStore();

    // Clean up on unmount
    return () => {
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
      }
      
      // End connection to store
      endConnection();
    };
  }, []);

  // Load cached subscription info from AsyncStorage
  const loadCachedSubscriptionInfo = async () => {
    try {
      const cachedInfo = await AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY);
      
      if (cachedInfo) {
        const parsedInfo: SubscriptionInfo = JSON.parse(cachedInfo);
        
        // Check if the cached info is still valid (not expired)
        if (parsedInfo.expiryDate && new Date(parsedInfo.expiryDate) > new Date()) {
          setSubscriptionInfo(parsedInfo);
          setIsSubscribed(parsedInfo.isActive);
        } else {
          // Cached subscription is expired
          setIsSubscribed(false);
        }
      }
    } catch (err) {
      console.error('Error loading cached subscription info:', err);
    }
  };

  // Save subscription info to AsyncStorage
  const cacheSubscriptionInfo = async (info: SubscriptionInfo) => {
    try {
      await AsyncStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(info));
    } catch (err) {
      console.error('Error caching subscription info:', err);
    }
  };

  // Fetch available subscription products
  const fetchSubscriptionProducts = async () => {
    if (!isConnected) return;
    
    setIsLoading(true);
    
    try {
      const products = await getSubscriptions({
        skus: Object.values(SUBSCRIPTION_SKUS),
      });
      
      setSubscriptionProducts(products);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch subscription products'));
      console.error('Error fetching subscription products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle successful purchase
  const handlePurchaseUpdate = async (purchase: ProductPurchase | SubscriptionPurchase) => {
    const receipt = purchase.transactionReceipt;
    
    if (receipt) {
      try {
        // Send the receipt to backend for validation
        const { verifySubscriptionReceipt } = useApi();
        const result = await verifySubscriptionReceipt(receipt);
        
        if (result.isSubscribed) {
          // Receipt was verified by the server, update local state
          const newSubscriptionInfo: SubscriptionInfo = {
            isActive: true,
            type: result.subscription.type as SubscriptionType,
            expiryDate: result.subscription.expiresDate,
            lastVerified: new Date(),
          };
          
          setSubscriptionInfo(newSubscriptionInfo);
          setIsSubscribed(true);
          
          // Cache the subscription info
          cacheSubscriptionInfo(newSubscriptionInfo);
        } else {
          console.error('Server rejected receipt');
          setError(new Error('Server could not verify receipt'));
          setIsSubscribed(false);
        }
        
        // Finish the transaction
        await finishTransaction({ purchase, isConsumable: false });
      } catch (err) {
        console.error('Error processing purchase:', err);
      }
    }
  };

  // Handle purchase errors
  const handlePurchaseError = (error: PurchaseError) => {
    console.error('Purchase error:', error);
    setError(new Error(error.message));
  };

  // Check subscription status
  const checkSubscriptionStatus = async (): Promise<boolean> => {
    if (!isConnected) return false;
    
    setIsLoading(true);
    
    try {
      // First check with server
      const { getSubscriptionStatus } = useApi();
      const serverStatus = await getSubscriptionStatus();
      
      if (serverStatus.isSubscribed) {
        // Server confirms active subscription
        const newSubscriptionInfo: SubscriptionInfo = {
          isActive: true,
          type: serverStatus.subscription.type as SubscriptionType,
          expiryDate: serverStatus.subscription.expiresDate,
          lastVerified: new Date(),
        };
        
        setSubscriptionInfo(newSubscriptionInfo);
        setIsSubscribed(true);
        
        // Cache the subscription info
        cacheSubscriptionInfo(newSubscriptionInfo);
        
        return true;
      }
      
      // If server says not subscribed, double-check locally
      // Get available purchases (active subscriptions)
      const purchases = await getAvailablePurchases();
      
      // Filter for subscription purchases
      const subscriptionPurchases = purchases.filter(
        purchase => Object.values(SUBSCRIPTION_SKUS).includes(purchase.productId)
      );
      
      if (subscriptionPurchases.length > 0) {
        // Found local subscription, let's verify it with the server
        // Sort by most recent purchase
        subscriptionPurchases.sort((a, b) => 
          new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
        );
        
        const latestPurchase = subscriptionPurchases[0];
        
        if (latestPurchase.transactionReceipt) {
          // Send to server for verification
          const { verifySubscriptionReceipt } = useApi();
          const verificationResult = await verifySubscriptionReceipt(
            latestPurchase.transactionReceipt
          );
          
          if (verificationResult.isSubscribed) {
            // Server now confirms active subscription
            const newSubscriptionInfo: SubscriptionInfo = {
              isActive: true,
              type: verificationResult.subscription.type as SubscriptionType,
              expiryDate: verificationResult.subscription.expiresDate,
              lastVerified: new Date(),
            };
            
            setSubscriptionInfo(newSubscriptionInfo);
            setIsSubscribed(true);
            
            // Cache the subscription info
            cacheSubscriptionInfo(newSubscriptionInfo);
            
            return true;
          }
        }
      }
      
      // No active subscriptions found
      setIsSubscribed(false);
      setSubscriptionInfo(null);
      
      // Clear cached subscription info
      await AsyncStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
      
      return false;
    } catch (err) {
      console.error('Error checking subscription status:', err);
      setError(err instanceof Error ? err : new Error('Failed to check subscription status'));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Purchase a subscription
  const purchaseSubscription = async (productId: string, offerToken?: string) => {
    if (!isConnected) {
      throw new Error('Store connection not established');
    }
    
    setIsLoading(true);
    
    try {
      // For iOS
      if (Platform.OS === 'ios') {
        await requestSubscription({
          sku: productId,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        });
      } 
      // For Android
      else {
        await requestSubscription({
          sku: productId,
          ...(offerToken && { subscriptionOffers: [{ sku: productId, offerToken }] }),
        });
      }
      
      // The purchase result will be handled by the purchaseUpdatedListener
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to purchase subscription'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Restore purchases
  const restorePurchases = async () => {
    if (!isConnected) {
      throw new Error('Store connection not established');
    }
    
    setIsLoading(true);
    
    try {
      // This will trigger the purchaseUpdatedListener for any previously
      // purchased non-consumable products or active subscriptions
      await checkSubscriptionStatus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to restore purchases'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Context value
  const value: SubscriptionContextType = {
    isSubscribed,
    subscriptionInfo,
    subscriptionProducts,
    isLoading,
    error,
    checkSubscriptionStatus,
    purchaseSubscription,
    restorePurchases,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

// Custom hook for using the subscription context
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  
  return context;
}; 