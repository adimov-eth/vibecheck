import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { userCacheService } from '../user-cache-service';
import { cacheService } from '../cache-service';
import { database } from '@/database';

// Mock the database
mock.module('@/database', () => ({
  database: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([])
        })
      })
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve()
      })
    }),
    query: {
      subscriptions: {
        findFirst: () => Promise.resolve(null)
      }
    }
  }
}));

describe('UserCacheService', () => {
  beforeEach(async () => {
    await cacheService.connect();
    await cacheService.clear();
  });
  
  afterEach(async () => {
    await cacheService.clear();
    await cacheService.disconnect();
  });
  
  describe('getUser', () => {
    it('should return cached user if exists', async () => {
      const userId = 'user123';
      const cachedUser = { id: userId, email: 'test@example.com', name: 'Test User' };
      
      // Pre-cache the user
      await cacheService.set(`user:${userId}`, cachedUser, { ttl: 3600 });
      
      const result = await userCacheService.getUser(userId);
      expect(result).toEqual(cachedUser);
    });
    
    it('should fetch from database and cache if not in cache', async () => {
      const userId = 'user456';
      const dbUser = { id: userId, email: 'db@example.com', name: 'DB User' };
      
      // Mock database response
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([dbUser])
            })
          })
        })
      };
      
      // Override database for this test
      const originalDb = (global as any).database;
      (global as any).database = mockDb;
      
      const result = await userCacheService.getUser(userId);
      expect(result).toEqual(dbUser);
      
      // Verify it was cached
      const cached = await cacheService.get(`user:${userId}`);
      expect(cached).toEqual(dbUser);
      
      // Restore original database
      (global as any).database = originalDb;
    });
    
    it('should return null for non-existent user', async () => {
      const result = await userCacheService.getUser('non-existent');
      expect(result).toBeNull();
    });
  });
  
  describe('getUserByEmail', () => {
    it('should cache user by email', async () => {
      const email = 'test@example.com';
      const cachedUser = { id: 'user123', email, name: 'Test User' };
      
      await cacheService.set(`user:email:${email}`, cachedUser, { ttl: 3600 });
      
      const result = await userCacheService.getUserByEmail(email);
      expect(result).toEqual(cachedUser);
    });
  });
  
  describe('updateUser', () => {
    it('should invalidate all user caches', async () => {
      const userId = 'user789';
      const email = 'update@example.com';
      
      // Pre-cache some data
      await cacheService.set(`user:${userId}`, { id: userId });
      await cacheService.set(`user:email:${email}`, { id: userId, email });
      await cacheService.set(`user:subscription:${userId}`, { subscription: 'active' });
      
      // Update user
      await userCacheService.updateUser(userId, { name: 'Updated Name' });
      
      // Verify caches are invalidated
      expect(await cacheService.get(`user:${userId}`)).toBeNull();
      expect(await cacheService.get(`user:email:${email}`)).toBeNull();
      expect(await cacheService.get(`user:subscription:${userId}`)).toBeNull();
    });
  });
  
  describe('getUserWithSubscription', () => {
    it('should use getOrSet pattern', async () => {
      const userId = 'user999';
      const cacheKey = `user:subscription:${userId}`;
      
      // First call should fetch and cache
      const result1 = await userCacheService.getUserWithSubscription(userId);
      
      // Second call should use cache
      const result2 = await userCacheService.getUserWithSubscription(userId);
      
      expect(result1).toEqual(result2);
    });
  });
  
  describe('invalidateUserCache', () => {
    it('should clear all user-related caches', async () => {
      const userId = 'user111';
      
      // Set up various caches
      await cacheService.set(`user:${userId}`, { id: userId });
      await cacheService.set(`user:subscription:${userId}`, { sub: 'active' });
      await cacheService.set('other:cache', { data: 'should remain' });
      
      await userCacheService.invalidateUserCache(userId);
      
      // User caches should be cleared
      expect(await cacheService.get(`user:${userId}`)).toBeNull();
      expect(await cacheService.get(`user:subscription:${userId}`)).toBeNull();
      
      // Other caches should remain
      expect(await cacheService.get('other:cache')).not.toBeNull();
    });
  });
});