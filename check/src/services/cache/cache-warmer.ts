import { database } from '@/database';
import { conversations, users } from '@/database/schema';
import { desc, gt, sql } from 'drizzle-orm';
import { userCacheService } from './user-cache-service';
import { conversationCacheService } from './conversation-cache-service';
import { log } from '@/utils/logger';
import { scheduleJob } from 'node-schedule';

export class CacheWarmer {
  /**
   * Warm cache for a specific user
   */
  async warmUserCache(userId: string): Promise<void> {
    try {
      // Pre-load user data
      await userCacheService.getUser(userId);
      
      // Pre-load user with subscription
      await userCacheService.getUserWithSubscription(userId);
      
      // Pre-load recent conversations
      await conversationCacheService.getUserConversations(userId, 10);
      
      // Warm conversation details
      await conversationCacheService.warmConversationCache(userId);
      
      log.info('Cache warmed for user', { userId });
    } catch (error) {
      log.error('Failed to warm user cache', { userId, error });
    }
  }
  
  /**
   * Warm cache for popular/active users
   */
  async warmPopularData(): Promise<void> {
    try {
      // Get most active users in the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const popularUsers = await database
        .select({
          userId: conversations.userId,
          activityCount: sql<number>`count(*)`.as('activity_count')
        })
        .from(conversations)
        .where(gt(conversations.createdAt, sevenDaysAgo))
        .groupBy(conversations.userId)
        .orderBy(desc(sql`activity_count`))
        .limit(100);
      
      log.info(`Warming cache for ${popularUsers.length} active users`);
      
      // Warm cache for each popular user
      for (const { userId } of popularUsers) {
        await this.warmUserCache(userId);
      }
      
      log.info('Popular data cache warming completed');
    } catch (error) {
      log.error('Failed to warm popular data cache', error);
    }
  }
  
  /**
   * Warm cache for recently active users
   */
  async warmRecentlyActiveUsers(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // Get users with recent activity
      const recentUsers = await database
        .selectDistinct({ userId: conversations.userId })
        .from(conversations)
        .where(gt(conversations.updatedAt, oneHourAgo))
        .limit(50);
      
      log.info(`Warming cache for ${recentUsers.length} recently active users`);
      
      for (const { userId } of recentUsers) {
        await this.warmUserCache(userId);
      }
    } catch (error) {
      log.error('Failed to warm recently active users cache', error);
    }
  }
  
  /**
   * Preload common system data
   */
  async warmSystemCache(): Promise<void> {
    try {
      // This could include:
      // - System configuration
      // - Feature flags
      // - Common lookup data
      // - Subscription tiers
      
      log.info('System cache warmed');
    } catch (error) {
      log.error('Failed to warm system cache', error);
    }
  }
  
  /**
   * Schedule cache warming jobs
   */
  scheduleWarmingJobs(): void {
    // Warm popular data every 6 hours
    scheduleJob('0 */6 * * *', async () => {
      log.info('Running scheduled popular data cache warming');
      await this.warmPopularData();
    });
    
    // Warm recently active users every 30 minutes
    scheduleJob('*/30 * * * *', async () => {
      log.info('Running scheduled recently active users cache warming');
      await this.warmRecentlyActiveUsers();
    });
    
    // Warm system cache every hour
    scheduleJob('0 * * * *', async () => {
      log.info('Running scheduled system cache warming');
      await this.warmSystemCache();
    });
    
    log.info('Cache warming jobs scheduled');
  }
  
  /**
   * Manual cache warming for specific scenarios
   */
  async warmCacheForNewSession(userId: string): Promise<void> {
    // Called when user logs in
    await this.warmUserCache(userId);
  }
  
  async warmCacheAfterConversation(
    userId: string, 
    conversationId: string
  ): Promise<void> {
    // Refresh user's conversation list
    await conversationCacheService.invalidateUserConversations(userId);
    await conversationCacheService.getUserConversations(userId, 10);
    
    // Cache the new conversation
    await conversationCacheService.getConversation(conversationId);
  }
}

export const cacheWarmer = new CacheWarmer();