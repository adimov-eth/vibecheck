import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
} from 'react';
import {
  initConnection,
  endConnection,
  getSubscriptions,
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
import { useUser } from './UserContext';
import { useAuthTokenContext } from './AuthTokenContext';

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
  
  // Get user profile data
  const { profile } = useUser();
  
  // Get authentication token state
  const { tokenInitialized } = useAuthTokenContext();
  
  // Get API functions
  const api = useApi();
  
  // Connection state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  // Purchase listeners as refs to persist between renders
  const purchaseUpdateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const purchaseErrorSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Initialize connection to store
  useEffect(() => {
    const connectToStore = async () => {
      try {
        await initConnection();
        setIsConnected(true);
        
        // Set up purchase listeners
        purchaseUpdateSubscriptionRef.current = purchaseUpdatedListener(handlePurchaseUpdate);
        purchaseErrorSubscriptionRef.current = purchaseErrorListener(handlePurchaseError);
        
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
      if (purchaseUpdateSubscriptionRef.current) {
        purchaseUpdateSubscriptionRef.current.remove();
      }
      if (purchaseErrorSubscriptionRef.current) {
        purchaseErrorSubscriptionRef.current.remove();
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
        const { verifySubscriptionReceipt } = api;
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
    // Skip if token is not initialized
    if (!tokenInitialized) {
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Skip check if not authenticated
      if (!profile?.id) {
        setIsSubscribed(false);
        setSubscriptionInfo(null);
        setIsLoading(false);
        return false;
      }
      
      // Use the API to check subscription status
      const result = await api.getSubscriptionStatus();
      
      if (result.isSubscribed) {
        const subscriptionType = result.subscription.type as SubscriptionType;
        const expiryDate = result.subscription.expiresDate;
        
        const newSubscriptionInfo: SubscriptionInfo = {
          isActive: true,
          type: subscriptionType,
          expiryDate: expiryDate,
          lastVerified: new Date()
        };
        
        setIsSubscribed(true);
        setSubscriptionInfo(newSubscriptionInfo);
        
        // Cache subscription info
        await cacheSubscriptionInfo(newSubscriptionInfo);
        
        setIsLoading(false);
        return true;
      } else {
        setIsSubscribed(false);
        setSubscriptionInfo(null);
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error('Failed to check subscription status:', err.message);
        setError(err);
      } else {
        console.error('Failed to check subscription status:', err);
        setError(new Error(String(err)));
      }
      setIsLoading(false);
      return false;
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

  // Update useEffect to check subscription only when profile is loaded and token is initialized
  useEffect(() => {
    // Skip if we don't have profile ID or token isn't initialized
    if (!profile?.id || !isConnected || !tokenInitialized) {
      return;
    }

    // Avoid checking too frequently - add debounce
    const checkTimeout = setTimeout(() => {
      checkSubscriptionStatus().catch(err => {
        console.error('Failed to check subscription status:', err);
      });
    }, 1000); // 1 second delay to avoid rapid checks

    return () => {
      clearTimeout(checkTimeout);
    };
  }, [profile?.id, isConnected, tokenInitialized, checkSubscriptionStatus]);

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