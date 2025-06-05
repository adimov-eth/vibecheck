import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { subscriptions } from '@/database/schema';

export interface Subscription {
  id: string;
  userId: string;
  status: string;
  plan: string;
  expiresAt: Date;
  appleTransactionId?: string;
  appleOriginalTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionFactory {
  static build(overrides: Partial<Subscription> = {}): Subscription {
    const now = new Date();
    const isActive = overrides.status === 'active' || (!overrides.status && faker.datatype.boolean());
    
    return {
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      status: isActive ? 'active' : faker.helpers.arrayElement(['expired', 'cancelled']),
      plan: faker.helpers.arrayElement(['basic', 'premium', 'pro']),
      expiresAt: isActive ? faker.date.future() : faker.date.past(),
      appleTransactionId: faker.string.numeric(18),
      appleOriginalTransactionId: faker.string.numeric(18),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides
    };
  }
  
  static async create(overrides: Partial<Subscription> = {}): Promise<Subscription> {
    const subscription = this.build(overrides);
    
    const [created] = await database.insert(subscriptions)
      .values({
        id: subscription.id,
        userId: subscription.userId,
        status: subscription.status,
        plan: subscription.plan,
        expiresAt: subscription.expiresAt,
        appleTransactionId: subscription.appleTransactionId,
        appleOriginalTransactionId: subscription.appleOriginalTransactionId,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      })
      .returning();
    
    return created;
  }
  
  static buildActive(userId: string, daysRemaining = 30): Partial<Subscription> {
    return {
      userId,
      status: 'active',
      expiresAt: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000),
      plan: 'premium'
    };
  }
  
  static buildExpired(userId: string, daysAgo = 7): Partial<Subscription> {
    return {
      userId,
      status: 'expired',
      expiresAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      plan: 'basic'
    };
  }
  
  static async createActive(userId: string, daysRemaining = 30): Promise<Subscription> {
    return this.create(this.buildActive(userId, daysRemaining));
  }
  
  static async createExpired(userId: string, daysAgo = 7): Promise<Subscription> {
    return this.create(this.buildExpired(userId, daysAgo));
  }
}