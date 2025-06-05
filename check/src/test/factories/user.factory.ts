import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { users, type User } from '@/database/schema';

export class UserFactory {
  static build(overrides: Partial<User> = {}): User {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: faker.string.uuid(),
      email: faker.internet.email().toLowerCase(),
      name: faker.person.fullName(),
      appAccountToken: faker.string.alphanumeric(64),
      accountLocked: false,
      accountLockedAt: null,
      accountLockReason: null,
      unlockToken: null,
      unlockTokenGeneratedAt: null,
      createdAt: now - 86400, // 1 day ago
      updatedAt: now,
      ...overrides
    };
  }
  
  static async create(overrides: Partial<User> = {}): Promise<User> {
    const user = this.build(overrides);
    
    const [created] = await database.insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        appAccountToken: user.appAccountToken,
        accountLocked: user.accountLocked,
        accountLockedAt: user.accountLockedAt,
        accountLockReason: user.accountLockReason,
        unlockToken: user.unlockToken,
        unlockTokenGeneratedAt: user.unlockTokenGeneratedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })
      .returning();
    
    return created;
  }
  
  static buildMany(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }
  
  static async createMany(count: number, overrides: Partial<User> = {}): Promise<User[]> {
    const usersToCreate = this.buildMany(count, overrides);
    const created = await database.insert(users)
      .values(usersToCreate)
      .returning();
    
    return created;
  }
  
  static buildWithSubscription(subscriptionOverrides: any = {}): {
    user: User;
    subscription: any;
  } {
    const user = this.build();
    const subscription = {
      id: faker.string.uuid(),
      userId: user.id,
      status: 'active',
      plan: faker.helpers.arrayElement(['basic', 'premium', 'pro']),
      expiresAt: faker.date.future(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...subscriptionOverrides
    };
    
    return { user, subscription };
  }
}