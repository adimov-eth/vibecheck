import { drizzleDb as database } from '@/database/drizzle';
import { 
  users, 
  conversations, 
  audios, 
  subscriptions
} from '@/database/schema';
import { sql } from 'drizzle-orm';
import { runMigrations } from '@/database/migrations';
import { log } from '@/utils/logger';

export class TestDatabase {
  private static instance: TestDatabase;
  private isInitialized = false;
  
  static async getInstance(): Promise<TestDatabase> {
    if (!this.instance) {
      this.instance = new TestDatabase();
      await this.instance.initialize();
    }
    return this.instance;
  }
  
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Ensure we're in test environment
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('TestDatabase can only be used in test environment');
      }
      
      // Run migrations to ensure schema is up to date
      await runMigrations();
      
      this.isInitialized = true;
      log.info('Test database initialized');
    } catch (error) {
      log.error('Failed to initialize test database', error);
      throw error;
    }
  }
  
  /**
   * Clean all tables - order matters due to foreign keys
   */
  async clean(): Promise<void> {
    try {
      // Delete in order to respect foreign key constraints
      await database.delete(audios).execute();
      await database.delete(conversations).execute();
      await database.delete(subscriptions).execute();
      await database.delete(users).execute();
      
      log.debug('Test database cleaned');
    } catch (error) {
      log.error('Failed to clean test database', error);
      throw error;
    }
  }
  
  /**
   * Seed database with test data
   */
  async seed(): Promise<{
    users: any[];
    conversations: any[];
    subscriptions: any[];
  }> {
    const { UserFactory, ConversationFactory, SubscriptionFactory } = await import('../factories');
    
    // Create users
    const testUsers = await UserFactory.createMany(3);
    
    // Create conversations for each user
    const testConversations: any[] = [];
    for (const user of testUsers) {
      const userConversations = await ConversationFactory.createMany(2, {
        userId: user.id
      });
      testConversations.push(...userConversations);
    }
    
    // Create subscriptions
    const testSubscriptions = await Promise.all([
      SubscriptionFactory.createActive(testUsers[0].id),
      SubscriptionFactory.createExpired(testUsers[1].id)
    ]);
    
    log.info('Test database seeded', {
      users: testUsers.length,
      conversations: testConversations.length,
      subscriptions: testSubscriptions.length
    });
    
    return {
      users: testUsers,
      conversations: testConversations,
      subscriptions: testSubscriptions
    };
  }
  
  /**
   * Reset database to clean state
   */
  async reset(): Promise<void> {
    await this.clean();
    await this.initialize();
  }
  
  /**
   * Get table counts for verification
   */
  async getCounts(): Promise<Record<string, number>> {
    const counts = {
      users: await this.getTableCount(users),
      conversations: await this.getTableCount(conversations),
      audios: await this.getTableCount(audios),
      subscriptions: await this.getTableCount(subscriptions)
    };
    
    return counts;
  }
  
  private async getTableCount(table: any): Promise<number> {
    const result = await database
      .select({ count: sql<number>`count(*)` })
      .from(table);
    return result[0]?.count || 0;
  }
  
  /**
   * Execute raw SQL for testing edge cases
   */
  async execute(query: string, params: any[] = []): Promise<any> {
    return await database.execute(sql.raw(query));
  }
  
  /**
   * Create a test transaction that auto-rollbacks
   */
  async withTransaction<T>(
    fn: (tx: any) => Promise<T>
  ): Promise<T> {
    let result: T;
    
    try {
      await database.transaction(async (tx) => {
        result = await fn(tx);
        // Force rollback to keep tests isolated
        throw new Error('ROLLBACK');
      });
    } catch (error: any) {
      if (error.message !== 'ROLLBACK') {
        throw error;
      }
    }
    
    return result!;
  }
}

// Export singleton instance
export const testDb = TestDatabase.getInstance();