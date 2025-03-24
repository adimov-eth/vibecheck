export const SUBSCRIPTION_SKUS = {
  MONTHLY: "com.vibecheck.subscription.monthly" as const,
  YEARLY: "com.vibecheck.subscription.yearly" as const,
};

export type SubscriptionType = "monthly" | "yearly";

export interface SubscriptionDetails {
  type: SubscriptionType | null;
  expiresDate: Date | null;
}

export interface SubscriptionStatus {
  isSubscribed: boolean;
  subscription: SubscriptionDetails;
}
