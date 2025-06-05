import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CacheService } from '../cache-service';

describe('CacheService', () => {
  let cacheService: CacheService;
  
  beforeEach(async () => {
    cacheService = new CacheService();
    await cacheService.connect();
    await cacheService.clear();
  });
  
  afterEach(async () => {
    await cacheService.clear();
    await cacheService.disconnect();
  });
  
  describe('basic operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test:key';
      const value = { data: 'test', number: 123, nested: { prop: true } };
      
      await cacheService.set(key, value);
      const retrieved = await cacheService.get(key);
      
      expect(retrieved).toEqual(value);
    });
    
    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non-existent');
      expect(result).toBeNull();
    });
    
    it('should respect TTL', async () => {
      const key = 'test:ttl';
      const value = 'test-value';
      
      await cacheService.set(key, value, { ttl: 1 });
      
      // Should exist immediately
      expect(await cacheService.get(key)).toBe(value);
      
      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(await cacheService.get(key)).toBeNull();
    });
    
    it('should handle large values with compression', async () => {
      const key = 'test:large';
      const value = {
        data: 'x'.repeat(2000), // 2KB string
        array: Array(100).fill('test-data')
      };
      
      await cacheService.set(key, value, { compress: true });
      const retrieved = await cacheService.get(key);
      
      expect(retrieved).toEqual(value);
    });
    
    it('should auto-compress values over threshold', async () => {
      const key = 'test:auto-compress';
      const value = 'y'.repeat(1500); // Over 1KB threshold
      
      await cacheService.set(key, value);
      const retrieved = await cacheService.get(key);
      
      expect(retrieved).toBe(value);
    });
  });
  
  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const key = 'test:getOrSet';
      const value = { cached: true };
      
      await cacheService.set(key, value);
      
      let factoryCalled = false;
      const result = await cacheService.getOrSet(
        key,
        async () => {
          factoryCalled = true;
          return { cached: false };
        }
      );
      
      expect(result).toEqual(value);
      expect(factoryCalled).toBe(false);
    });
    
    it('should call factory and cache result if not exists', async () => {
      const key = 'test:getOrSet:new';
      const value = { generated: true };
      
      let factoryCalled = false;
      const result = await cacheService.getOrSet(
        key,
        async () => {
          factoryCalled = true;
          return value;
        },
        { ttl: 300 }
      );
      
      expect(result).toEqual(value);
      expect(factoryCalled).toBe(true);
      
      // Verify it was cached
      const cached = await cacheService.get(key);
      expect(cached).toEqual(value);
    });
  });
  
  describe('cache invalidation', () => {
    it('should invalidate by pattern', async () => {
      await cacheService.set('user:1:profile', { id: 1 });
      await cacheService.set('user:1:settings', { theme: 'dark' });
      await cacheService.set('user:2:profile', { id: 2 });
      
      await cacheService.invalidate('user:1:*');
      
      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('user:1:settings')).toBeNull();
      expect(await cacheService.get('user:2:profile')).not.toBeNull();
    });
    
    it('should invalidate by tag', async () => {
      await cacheService.set('data1', 'value1', { tags: ['user:1'] });
      await cacheService.set('data2', 'value2', { tags: ['user:1', 'type:profile'] });
      await cacheService.set('data3', 'value3', { tags: ['user:2'] });
      
      await cacheService.invalidateByTag('user:1');
      
      expect(await cacheService.get('data1')).toBeNull();
      expect(await cacheService.get('data2')).toBeNull();
      expect(await cacheService.get('data3')).not.toBeNull();
    });
    
    it('should handle multiple tags', async () => {
      await cacheService.set('item1', 'value1', { tags: ['tag1', 'tag2'] });
      await cacheService.set('item2', 'value2', { tags: ['tag1'] });
      await cacheService.set('item3', 'value3', { tags: ['tag2'] });
      
      await cacheService.invalidateByTag('tag1');
      
      expect(await cacheService.get('item1')).toBeNull();
      expect(await cacheService.get('item2')).toBeNull();
      expect(await cacheService.get('item3')).not.toBeNull();
    });
  });
  
  describe('error handling', () => {
    it('should return null on get errors', async () => {
      // Disconnect to force error
      await cacheService.disconnect();
      
      const result = await cacheService.get('any-key');
      expect(result).toBeNull();
    });
    
    it('should not throw on set errors', async () => {
      // Disconnect to force error
      await cacheService.disconnect();
      
      // Should not throw
      await cacheService.set('any-key', 'value');
      expect(true).toBe(true); // If we get here, it didn't throw
    });
  });
  
  describe('statistics', () => {
    it('should track hits and misses', async () => {
      cacheService.resetStats();
      
      await cacheService.set('key1', 'value1');
      await cacheService.get('key1'); // hit
      await cacheService.get('key2'); // miss
      await cacheService.get('key1'); // hit
      
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.67, 1);
    });
    
    it('should track errors', async () => {
      cacheService.resetStats();
      
      // Disconnect to force errors
      await cacheService.disconnect();
      
      await cacheService.get('key1');
      await cacheService.set('key2', 'value');
      
      const stats = cacheService.getStats();
      expect(stats.errors).toBeGreaterThan(0);
    });
  });
  
  describe('edge cases', () => {
    it('should handle null values', async () => {
      const key = 'test:null';
      await cacheService.set(key, null);
      
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    });
    
    it('should handle undefined values', async () => {
      const key = 'test:undefined';
      await cacheService.set(key, undefined);
      
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    });
    
    it('should handle empty strings', async () => {
      const key = 'test:empty';
      await cacheService.set(key, '');
      
      const result = await cacheService.get(key);
      expect(result).toBe('');
    });
    
    it('should handle arrays', async () => {
      const key = 'test:array';
      const value = [1, 2, 3, { nested: true }];
      
      await cacheService.set(key, value);
      const result = await cacheService.get(key);
      
      expect(result).toEqual(value);
    });
  });
});