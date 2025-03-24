import type { SubscriptionType } from '@/types/subscription';
import { EventEmitter } from 'events';

interface SubscriptionStatus {
  isSubscribed: boolean;
  subscriptionType: SubscriptionType | null;
  expiryDate: Date | null;
}

class SubscriptionEventService extends EventEmitter {
  private static instance: SubscriptionEventService;

  private constructor() {
    super();
  }

  static getInstance(): SubscriptionEventService {
    if (!SubscriptionEventService.instance) {
      SubscriptionEventService.instance = new SubscriptionEventService();
    }
    return SubscriptionEventService.instance;
  }

  updateSubscriptionStatus(status: SubscriptionStatus) {
    this.emit('subscriptionUpdated', status);
  }

  onSubscriptionUpdated(callback: (status: SubscriptionStatus) => void) {
    this.on('subscriptionUpdated', callback);
  }

  removeSubscriptionListener(callback: (status: SubscriptionStatus) => void) {
    this.removeListener('subscriptionUpdated', callback);
  }
}

export const subscriptionEvents = SubscriptionEventService.getInstance(); 