import { iapService } from "@/services/iap";
import { subscriptionEvents } from "@/services/subscriptionEvents";
import { type SubscriptionType } from "@/types/subscription";
import {
    type Subscription,
    type SubscriptionAndroid,
    type SubscriptionIOS
} from "react-native-iap";
import { type StateCreator } from "zustand";

export type SubscriptionPlan = SubscriptionType | null;

export interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  subscriptionPeriod: string;
  subscriptionOfferDetails?: Array<{
    offerToken: string;
    [key: string]: unknown;
  }>;
}

export interface SubscriptionState {
  isSubscribed: boolean;
  subscriptionPlan: SubscriptionPlan;
  expiryDate: Date | null;
  isLoading: boolean;
  error: string | null;
  subscriptionProducts: SubscriptionProduct[];
}

export interface SubscriptionActions {
  purchaseSubscription: (
    productId: string,
    offerToken?: string,
  ) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  setSubscriptionStatus: (
    isSubscribed: boolean,
    plan: SubscriptionType | null,
    expiryDate: Date | null,
  ) => void;
  fetchSubscriptionProducts: () => Promise<void>;
}

const updateSubscriptionState = (
  set: (
    data: Partial<SubscriptionState> | ((state: SubscriptionState) => Partial<SubscriptionState>),
  ) => void,
  data:
    | Partial<SubscriptionState>
    | ((state: SubscriptionState) => Partial<SubscriptionState>),
) => {
  if (typeof data === "function") {
    set((state: SubscriptionState) => ({ ...state, ...data(state) }));
  } else {
    set((state: SubscriptionState) => ({ ...state, ...data }));
  }
};

const mapSubscriptionToProduct = (subscription: Subscription): SubscriptionProduct => {
  if ('subscriptionPeriodNumberIOS' in subscription) {
    const iosSubscription = subscription as SubscriptionIOS;
    return {
      productId: iosSubscription.productId,
      title: iosSubscription.title,
      description: iosSubscription.description,
      price: iosSubscription.localizedPrice || '0',
      currency: iosSubscription.currency || 'USD',
      subscriptionPeriod: `P${iosSubscription.subscriptionPeriodNumberIOS || 1}${iosSubscription.subscriptionPeriodUnitIOS || 'M'}`,
      subscriptionOfferDetails: undefined,
    };
  } else {
    const androidSubscription = subscription as SubscriptionAndroid;
    const firstPhase = androidSubscription.subscriptionOfferDetails[0]?.pricingPhases.pricingPhaseList[0];
    const offerDetails = androidSubscription.subscriptionOfferDetails?.map(offer => ({
      ...offer,
      offerToken: offer.offerToken,
    }));
    
    return {
      productId: androidSubscription.productId,
      title: androidSubscription.title,
      description: androidSubscription.description,
      price: firstPhase?.formattedPrice || '0',
      currency: firstPhase?.priceCurrencyCode || 'USD',
      subscriptionPeriod: firstPhase?.billingPeriod || 'P1M',
      subscriptionOfferDetails: offerDetails,
    };
  }
};

export const createSubscriptionSlice: StateCreator<
  SubscriptionState & SubscriptionActions,
  [],
  [],
  SubscriptionState & SubscriptionActions
> = (set) => {
  // Set up subscription event listener
  subscriptionEvents.onSubscriptionUpdated((status) => {
    updateSubscriptionState(set, {
      isSubscribed: status.isSubscribed,
      subscriptionPlan: status.subscriptionType,
      expiryDate: status.expiryDate,
    });
  });

  return {
    // Initial state
    isSubscribed: false,
    subscriptionPlan: null,
    expiryDate: null,
    isLoading: false,
    error: null,
    subscriptionProducts: [],

    // Actions
    purchaseSubscription: async (productId: string, offerToken?: string) => {
      updateSubscriptionState(set, { isLoading: true, error: null });

      try {
        await iapService.purchaseSubscription(productId, offerToken);
        return true;
      } catch (error) {
        console.error("Purchase error:", error);
        updateSubscriptionState(set, {
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to purchase subscription",
        });
        return false;
      }
    },

    restorePurchases: async () => {
      updateSubscriptionState(set, { isLoading: true, error: null });

      try {
        // Note: The actual restore process is handled by the purchaseUpdatedListener
        // in the IAP service when it receives restored transactions
        
        updateSubscriptionState(set, { isLoading: false });
        return true;
      } catch (error) {
        console.error("Restore error:", error);
        updateSubscriptionState(set, {
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to restore purchases",
        });
        return false;
      }
    },

    setSubscriptionStatus: (
      isSubscribed: boolean,
      plan: SubscriptionType | null,
      expiryDate: Date | null,
    ) => {
      updateSubscriptionState(set, {
        isSubscribed,
        subscriptionPlan: plan,
        expiryDate,
      });
    },

    fetchSubscriptionProducts: async () => {
      updateSubscriptionState(set, { isLoading: true, error: null });

      try {
        const subscriptions = await iapService.getSubscriptionProducts();
        const products = subscriptions.map(mapSubscriptionToProduct);

        updateSubscriptionState(set, {
          subscriptionProducts: products,
          isLoading: false,
        });
      } catch (error) {
        console.error("Error fetching subscription products:", error);
        updateSubscriptionState(set, {
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to fetch subscription products",
        });
      }
    },
  };
};
