import { cacheService, CacheOptions } from '@/services/cache/cache-service';
import { log } from '@/utils/logger';
import crypto from 'crypto';

/**
 * Decorator to cache method results
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Generate cache key from method name and arguments
      const argsHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(args))
        .digest('hex')
        .substring(0, 8);
      const cacheKey = `${target.constructor.name}:${propertyName}:${argsHash}`;
      
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        log.debug('Cache hit', { method: `${target.constructor.name}.${propertyName}` });
        return cached;
      }
      
      // Call original method
      const result = await originalMethod.apply(this, args);
      
      // Cache the result
      await cacheService.set(cacheKey, result, options);
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Decorator to invalidate cache after method execution
 */
export function CacheInvalidate(patterns: string[]) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      // Invalidate cache patterns
      for (const pattern of patterns) {
        await cacheService.invalidate(pattern);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Decorator to invalidate cache by tags
 */
export function CacheInvalidateTags(tags: string[]) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      // Invalidate cache by tags
      for (const tag of tags) {
        await cacheService.invalidateByTag(tag);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Create a cache key for manual caching
 */
export function createCacheKey(namespace: string, ...parts: any[]): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .substring(0, 8);
  return `${namespace}:${hash}`;
}