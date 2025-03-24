import { type StateCreator } from "zustand";

export type SubscriptionPlan = "monthly" | "yearly" | null;

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
    plan: SubscriptionPlan,
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

const mockPurchaseSubscription = async (
  productId: string,
  offerToken?: string,
) => {
  console.log(
    `Purchasing subscription: ${productId} with offer token: ${offerToken || "none"}`,
  );
  // Simulate a successful purchase
  return {
    isSubscribed: true,
    plan: productId.includes("yearly")
      ? "yearly"
      : ("monthly" as SubscriptionPlan),
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  };
};

const mockFetchProducts = async (): Promise<SubscriptionProduct[]> => {
  return [
    {
      productId: "com.vibecheck.subscription.monthly",
      title: "VibeCheck Monthly",
      description: "Unlimited access to all features",
      price: "4.99",
      currency: "USD",
      subscriptionPeriod: "P1M",
    },
    {
      productId: "com.vibecheck.subscription.yearly",
      title: "VibeCheck Yearly",
      description: "Unlimited access to all features, save 33%",
      price: "39.99",
      currency: "USD",
      subscriptionPeriod: "P1Y",
    },
  ];
};

export const createSubscriptionSlice: StateCreator<
  SubscriptionState & SubscriptionActions,
  [],
  [],
  SubscriptionState & SubscriptionActions
> = (set) => ({
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
      // This is a stub where integration with in-app purchases would happen
      // In a real implementation, you would call IAP methods here
      const result = await mockPurchaseSubscription(productId, offerToken);

      updateSubscriptionState(set, {
        isSubscribed: result.isSubscribed,
        subscriptionPlan: result.plan,
        expiryDate: result.expiryDate,
        isLoading: false,
      });

      return true;
    } catch (error) {
      console.error("Purchase error:", error);
      updateSubscriptionState(set, {
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to purchase subscription",
      });
      return false;
    }
  },

  restorePurchases: async () => {
    updateSubscriptionState(set, { isLoading: true, error: null });

    try {
      // This is a stub where integration with in-app purchases would happen
      // In a real implementation, you would call IAP restore methods here
      console.log("Restoring purchases");

      // Simulate a successful restore with no subscriptions
      updateSubscriptionState(set, { isLoading: false });
      return true;
    } catch (error) {
      console.error("Restore error:", error);
      updateSubscriptionState(set, {
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to restore purchases",
      });
      return false;
    }
  },

  setSubscriptionStatus: (
    isSubscribed: boolean,
    plan: SubscriptionPlan,
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
      // This is a stub where integration with in-app purchases would happen
      // In a real implementation, you would fetch product details from IAP
      const products = await mockFetchProducts();

      updateSubscriptionState(set, {
        subscriptionProducts: products,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error fetching subscription products:", error);
      updateSubscriptionState(set, {
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch subscription products",
      });
    }
  },
});
