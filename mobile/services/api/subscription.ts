import { type SubscriptionStatus } from "@/types/subscription";
import { handleError } from "@/utils/error";
import { apiClient } from "./client/ApiClient";

export const subscriptionApi = {
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    try {
      return await apiClient.get<SubscriptionStatus>('/subscription/status');
    } catch (error) {
      throw handleError(error, {
        defaultMessage: "Failed to fetch subscription status",
        serviceName: "SubscriptionAPI",
        errorType: "API_ERROR",
        severity: "ERROR",
      });
    }
  },

  async verifyPurchase(receipt: string, isTest = __DEV__): Promise<SubscriptionStatus> {
    try {
      return await apiClient.post<SubscriptionStatus>('/subscription/verify', {
        receipt,
        isTest,
      });
    } catch (error) {
      throw handleError(error, {
        defaultMessage: "Failed to verify purchase",
        serviceName: "SubscriptionAPI",
        errorType: "API_ERROR",
        severity: "ERROR",
      });
    }
  },
}; 