import { cacheService } from './cache-service';
import { createClient } from 'redis';
import { log } from '@/utils/logger';

export interface CacheMemoryStats {
  used: number;
  peak: number;
  overhead: number;
  dataset: number;
  percentage: number;
}

export interface CacheKeyStats {
  totalKeys: number;
  keysByPattern: Record<string, number>;
  ttlDistribution: {
    noTTL: number;
    under1Hour: number;
    under1Day: number;
    under1Week: number;
    over1Week: number;
  };
  largestKeys: Array<{ key: string; size: number }>;
}

export class CacheMetrics {
  private client: ReturnType<typeof createClient>;
  
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
  }
  
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }
  
  /**
   * Get current cache statistics
   */
  getCacheStats() {
    return cacheService.getStats();
  }
  
  /**
   * Get memory usage statistics
   */
  async getMemoryUsage(): Promise<CacheMemoryStats> {
    try {
      await this.connect();
      const info = await this.client.info('memory');
      
      // Parse memory info
      const parseValue = (key: string): number => {
        const match = info.match(new RegExp(`${key}:(\\d+)`));
        return match ? parseInt(match[1], 10) : 0;
      };
      
      const used = parseValue('used_memory');
      const peak = parseValue('used_memory_peak');
      const overhead = parseValue('used_memory_overhead');
      const dataset = parseValue('used_memory_dataset');
      const total = parseValue('total_system_memory') || used * 10; // Estimate if not available
      
      return {
        used,
        peak,
        overhead,
        dataset,
        percentage: (used / total) * 100
      };
    } catch (error) {
      log.error('Failed to get memory usage', error);
      return {
        used: 0,
        peak: 0,
        overhead: 0,
        dataset: 0,
        percentage: 0
      };
    }
  }
  
  /**
   * Get key statistics
   */
  async getKeyStats(): Promise<CacheKeyStats> {
    try {
      await this.connect();
      
      const dbSize = await this.client.dbSize();
      const keysByPattern = await this.getKeysByPattern();
      const ttlDistribution = await this.getTTLDistribution();
      const largestKeys = await this.getLargestKeys();
      
      return {
        totalKeys: dbSize,
        keysByPattern,
        ttlDistribution,
        largestKeys
      };
    } catch (error) {
      log.error('Failed to get key stats', error);
      return {
        totalKeys: 0,
        keysByPattern: {},
        ttlDistribution: {
          noTTL: 0,
          under1Hour: 0,
          under1Day: 0,
          under1Week: 0,
          over1Week: 0
        },
        largestKeys: []
      };
    }
  }
  
  /**
   * Get keys grouped by pattern
   */
  private async getKeysByPattern(): Promise<Record<string, number>> {
    const patterns = [
      'cache:user:*',
      'cache:session:*',
      'cache:conversation:*',
      'cache:transcription:*',
      'cache:analysis:*',
      'cache:route:*',
      'tag:*'
    ];
    
    const result: Record<string, number> = {};
    
    for (const pattern of patterns) {
      const keys = await this.client.keys(pattern);
      const basePattern = pattern.split(':')[1] || pattern;
      result[basePattern] = keys.length;
    }
    
    return result;
  }
  
  /**
   * Get TTL distribution
   */
  private async getTTLDistribution() {
    const distribution = {
      noTTL: 0,
      under1Hour: 0,
      under1Day: 0,
      under1Week: 0,
      over1Week: 0
    };
    
    // Sample keys for TTL analysis
    const sampleSize = 1000;
    const keys = await this.client.keys('cache:*');
    const sample = keys.slice(0, sampleSize);
    
    for (const key of sample) {
      const ttl = await this.client.ttl(key);
      
      if (ttl === -1) {
        distribution.noTTL++;
      } else if (ttl <= 3600) {
        distribution.under1Hour++;
      } else if (ttl <= 86400) {
        distribution.under1Day++;
      } else if (ttl <= 604800) {
        distribution.under1Week++;
      } else {
        distribution.over1Week++;
      }
    }
    
    // Scale up to total keys
    const scaleFactor = keys.length / sampleSize;
    Object.keys(distribution).forEach(key => {
      distribution[key as keyof typeof distribution] = 
        Math.round(distribution[key as keyof typeof distribution] * scaleFactor);
    });
    
    return distribution;
  }
  
  /**
   * Get largest keys by memory usage
   */
  private async getLargestKeys(limit = 10): Promise<Array<{ key: string; size: number }>> {
    try {
      // This requires Redis 4.0+ with MEMORY USAGE command
      const keys = await this.client.keys('cache:*');
      const sample = keys.slice(0, 100); // Sample for performance
      
      const keySizes = await Promise.all(
        sample.map(async (key) => {
          try {
            const size = await this.client.memoryUsage(key) || 0;
            return { key, size };
          } catch {
            return { key, size: 0 };
          }
        })
      );
      
      return keySizes
        .sort((a, b) => b.size - a.size)
        .slice(0, limit);
    } catch (error) {
      log.error('Failed to get largest keys', error);
      return [];
    }
  }
  
  /**
   * Log cache metrics periodically
   */
  async logMetrics(): Promise<void> {
    const stats = this.getCacheStats();
    const memory = await this.getMemoryUsage();
    const keys = await this.getKeyStats();
    
    log.info('Cache metrics', {
      hitRate: stats.hitRate.toFixed(2),
      hits: stats.hits,
      misses: stats.misses,
      errors: stats.errors,
      memoryUsed: `${(memory.used / 1024 / 1024).toFixed(2)} MB`,
      memoryPercentage: `${memory.percentage.toFixed(2)}%`,
      totalKeys: keys.totalKeys,
      keysByPattern: keys.keysByPattern
    });
  }
  
  /**
   * Export metrics for monitoring
   */
  async exportMetrics(): Promise<{
    stats: ReturnType<typeof cacheService.getStats>;
    memory: CacheMemoryStats;
    keys: CacheKeyStats;
    timestamp: Date;
  }> {
    return {
      stats: this.getCacheStats(),
      memory: await this.getMemoryUsage(),
      keys: await this.getKeyStats(),
      timestamp: new Date()
    };
  }
  
  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

export const cacheMetrics = new CacheMetrics();