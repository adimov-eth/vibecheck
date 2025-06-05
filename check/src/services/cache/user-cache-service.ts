import { cacheService } from './cache-service';
import { database } from '@/database';
import { users, sessions } from '@/database/schema';
import { eq } from 'drizzle-orm';
import type { User } from '@/types';
import { log } from '@/utils/logger';

export class UserCacheService {
  private userTTL = 3600; // 1 hour
  private sessionTTL = 86400; // 24 hours
  
  async getUser(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`;
    
    // Try cache first
    const cached = await cacheService.get<User>(cacheKey);
    if (cached) return cached;
    
    // Load from database
    const result = await database.select().from(users).where(eq(users.id, id)).limit(1);
    const user = result[0] || null;
    
    if (user) {
      // Cache the user
      await cacheService.set(cacheKey, user, { 
        ttl: this.userTTL, 
        tags: [`user:${id}`] 
      });
    }
    
    return user;
  }
  
  async getUserByEmail(email: string): Promise<User | null> {
    const cacheKey = `user:email:${email}`;
    
    // Try cache first
    const cached = await cacheService.get<User>(cacheKey);
    if (cached) return cached;
    
    // Load from database
    const result = await database.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0] || null;
    
    if (user) {
      // Cache the user
      await cacheService.set(cacheKey, user, { 
        ttl: this.userTTL,
        tags: [`user:${user.id}`]
      });
    }
    
    return user;
  }
  
  async updateUser(id: string, data: Partial<User>): Promise<void> {
    // Update in database
    await database.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id));
    
    // Invalidate all user caches
    await cacheService.invalidate(`user:${id}`);
    await cacheService.invalidate(`user:email:*`);
    await cacheService.invalidateByTag(`user:${id}`);
    
    log.info('User cache invalidated', { userId: id });
  }
  
  async getUserWithSubscription(userId: string): Promise<any> {
    const cacheKey = `user:subscription:${userId}`;
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        // This would be a join query in real implementation
        const user = await this.getUser(userId);
        if (!user) return null;
        
        // Get subscription data
        const subscription = await database.query.subscriptions.findFirst({
          where: (subs, { eq, and, gt }) => and(
            eq(subs.userId, userId),
            eq(subs.status, 'active'),
            gt(subs.expiresAt, new Date())
          )
        });
        
        return { ...user, subscription };
      },
      { ttl: 600, tags: [`user:${userId}`] } // 10 minutes
    );
  }
  
  async invalidateUserCache(userId: string): Promise<void> {
    await cacheService.invalidate(`user:${userId}`);
    await cacheService.invalidate(`user:subscription:${userId}`);
    await cacheService.invalidateByTag(`user:${userId}`);
  }
}

export const userCacheService = new UserCacheService();