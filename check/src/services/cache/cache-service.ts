import { createClient, RedisClientType } from 'redis';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { log } from '@/utils/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // For cache invalidation
  compress?: boolean; // For large values
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
}

export class CacheService {
  private client: RedisClientType;
  private defaultTTL = 3600; // 1 hour
  private keyPrefix = 'cache:';
  private compressionThreshold = 1024; // 1KB
  private isConnected = false;
  
  // Stats tracking
  private stats = {
    hits: 0,
    misses: 0,
    errors: 0
  };
  
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
        keepAlive: 30000,
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            log.error('Redis cache: max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });
    
    this.client.on('error', (err) => {
      log.error('Redis cache error:', err);
      this.isConnected = false;
    });
    
    this.client.on('connect', () => {
      log.info('Cache service connected');
      this.isConnected = true;
    });
    
    this.client.on('ready', () => {
      log.info('Cache service ready');
      this.isConnected = true;
    });
    
    this.client.on('end', () => {
      log.info('Cache service disconnected');
      this.isConnected = false;
    });
  }
  
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.stats.errors++;
      return null;
    }
    
    try {
      const fullKey = this.keyPrefix + key;
      const value = await this.client.get(fullKey);
      
      if (!value) {
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      
      // Handle compressed values
      if (value.startsWith('gzip:')) {
        const compressed = Buffer.from(value.slice(5), 'base64');
        const decompressed = await gunzipAsync(compressed);
        return JSON.parse(decompressed.toString());
      }
      
      return JSON.parse(value);
    } catch (error) {
      this.stats.errors++;
      log.error('Cache get error', { key, error });
      return null; // Fail gracefully
    }
  }
  
  async set<T>(
    key: string, 
    value: T, 
    options: CacheOptions = {}
  ): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const fullKey = this.keyPrefix + key;
      let serialized = JSON.stringify(value);
      
      // Compress large values
      if (options.compress || serialized.length > this.compressionThreshold) {
        const compressed = await gzipAsync(serialized);
        serialized = 'gzip:' + compressed.toString('base64');
      }
      
      const ttl = options.ttl || this.defaultTTL;
      
      if (ttl === Infinity) {
        await this.client.set(fullKey, serialized);
      } else {
        await this.client.setEx(fullKey, ttl, serialized);
      }
      
      // Handle tags for invalidation
      if (options.tags) {
        await this.addToTags(key, options.tags);
      }
    } catch (error) {
      this.stats.errors++;
      log.error('Cache set error', { key, error });
      // Don't throw - caching should not break the app
    }
  }
  
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Generate value
    const value = await factory();
    
    // Cache it
    await this.set(key, value, options);
    
    return value;
  }
  
  async invalidate(pattern: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const keys = await this.client.keys(this.keyPrefix + pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        log.debug(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      log.error('Cache invalidate error', { pattern, error });
    }
  }
  
  async invalidateByTag(tag: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const tagKey = `tag:${tag}`;
      const keys = await this.client.sMembers(tagKey);
      
      if (keys.length > 0) {
        const fullKeys = keys.map(k => this.keyPrefix + k);
        await this.client.del(fullKeys);
        await this.client.del(tagKey);
        log.debug(`Invalidated ${keys.length} cache keys with tag: ${tag}`);
      }
    } catch (error) {
      log.error('Cache invalidate by tag error', { tag, error });
    }
  }
  
  async clear(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    try {
      const keys = await this.client.keys(this.keyPrefix + '*');
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      
      // Also clear tag keys
      const tagKeys = await this.client.keys('tag:*');
      if (tagKeys.length > 0) {
        await this.client.del(tagKeys);
      }
      
      log.info('Cache cleared');
    } catch (error) {
      log.error('Cache clear error', error);
    }
  }
  
  private async addToTags(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      await this.client.sAdd(tagKey, key);
    }
  }
  
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    
    return {
      ...this.stats,
      hitRate
    };
  }
  
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0
    };
  }
  
  isReady(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export const cacheService = new CacheService();