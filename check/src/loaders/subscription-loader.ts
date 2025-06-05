import { BaseLoader } from './base-loader';
import { database } from '@/database';
import { subscriptions } from '@/database/schema';
import { inArray, and, eq, gt } from 'drizzle-orm';

export interface Subscription {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionLoader extends BaseLoader<string, Subscription | null> {
  constructor() {
    super(async (userIds) => {
      // Get active subscriptions for users
      const now = new Date();
      const subscriptionsList = await database
        .select()
        .from(subscriptions)
        .where(
          and(
            inArray(subscriptions.userId, userIds as string[]),
            eq(subscriptions.status, 'active'),
            gt(subscriptions.expiresAt, now)
          )
        );
      
      // Map by userId (assuming one active subscription per user)
      const subscriptionMap = new Map(
        subscriptionsList.map(s => [s.userId, s])
      );
      
      return userIds.map(userId => subscriptionMap.get(userId as string) || null);
    });
  }
}