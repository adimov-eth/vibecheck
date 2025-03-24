import { SUBSCRIPTION_SKUS } from '@/types/subscription';
import { handleError } from '@/utils/error';
import { Platform } from 'react-native';
import {
  endConnection,
  finishTransaction,
  getSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  type Purchase,
  type PurchaseError,
  type Subscription,
} from 'react-native-iap';
import { subscriptionApi } from './api/subscription';
import { subscriptionEvents } from './subscriptionEvents';

class IAPService {
  private static instance: IAPService;
  private purchaseUpdateSubscription: { remove: () => void } | null = null;
  private purchaseErrorSubscription: { remove: () => void } | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): IAPService {
    if (!IAPService.instance) {
      IAPService.instance = new IAPService();
    }
    return IAPService.instance;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      await initConnection();
      this.setupListeners();
      this.isInitialized = true;
    } catch (error) {
      throw handleError(error, {
        defaultMessage: "Failed to initialize in-app purchases",
        serviceName: "IAPService",
        errorType: "UNKNOWN_ERROR",
        severity: "ERROR",
      });
    }
  }

  private setupListeners() {
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        try {
          if (purchase.transactionReceipt) {
            // First verify the purchase with our backend
            const status = await subscriptionApi.verifyPurchase(purchase.transactionReceipt);
            
            // Emit subscription status update event
            subscriptionEvents.updateSubscriptionStatus({
              isSubscribed: status.isSubscribed,
              subscriptionType: status.subscription.type || 'monthly',
              expiryDate: status.subscription.expiresDate,
            });

            // Finally, finish the transaction
            await finishTransaction({ 
              purchase, 
              isConsumable: false,
            });
          }
        } catch (error) {
          throw handleError(error, {
            defaultMessage: "Failed to process purchase",
            serviceName: "IAPService",
            errorType: "UNKNOWN_ERROR",
            severity: "ERROR",
          });
        }
      }
    );

    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        throw handleError(error, {
          defaultMessage: "Purchase error occurred",
          serviceName: "IAPService",
          errorType: "UNKNOWN_ERROR",
          severity: "ERROR",
        });
      }
    );
  }

  async getSubscriptionProducts(): Promise<Subscription[]> {
    try {
      await this.initialize();
      return await getSubscriptions({ skus: Object.values(SUBSCRIPTION_SKUS) });
    } catch (error) {
      throw handleError(error, {
        defaultMessage: "Failed to fetch subscription products",
        serviceName: "IAPService",
        errorType: "UNKNOWN_ERROR",
        severity: "ERROR",
      });
    }
  }

  async purchaseSubscription(productId: string, offerToken?: string): Promise<void> {
    try {
      await this.initialize();
      
      if (Platform.OS === 'ios') {
        await requestSubscription({
          sku: productId,
        });
      } else {
        await requestSubscription({
          sku: productId,
          ...(offerToken && { subscriptionOffers: [{ sku: productId, offerToken }] }),
        });
      }
    } catch (error) {
      throw handleError(error, {
        defaultMessage: "Failed to purchase subscription",
        serviceName: "IAPService",
        errorType: "UNKNOWN_ERROR",
        severity: "ERROR",
      });
    }
  }

  cleanup() {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }
    this.isInitialized = false;
    endConnection();
  }
}

export const iapService = IAPService.getInstance(); 