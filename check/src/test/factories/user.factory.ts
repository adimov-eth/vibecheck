import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { users } from '@/database/schema';
import type { User } from '@/types';

export class UserFactory {
  static build(overrides: Partial<User> = {}): User {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email().toLowerCase(),
      name: faker.person.fullName(),
      appleAccountToken: faker.string.alphanumeric(64),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
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
        appleAccountToken: user.appleAccountToken,
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
    const users = this.buildMany(count, overrides);
    const created = await database.insert(users)
      .values(users)
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