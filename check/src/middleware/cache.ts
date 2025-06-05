import { Request, Response, NextFunction } from 'express';
import { cacheService } from '@/services/cache/cache-service';
import { log } from '@/utils/logger';

export interface CacheMiddlewareOptions {
  keyGenerator?: (req: Request) => string;
  ttl?: number;
  condition?: (req: Request) => boolean;
  tags?: (req: Request) => string[];
}

/**
 * Cache middleware for routes
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Check if Redis is connected
    if (!cacheService.isReady()) {
      return next();
    }
    
    // Check condition
    if (options.condition && !options.condition(req)) {
      return next();
    }
    
    // Generate cache key
    const cacheKey = options.keyGenerator 
      ? options.keyGenerator(req)
      : `route:${req.path}:${JSON.stringify(req.query)}`;
    
    try {
      // Try cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey.substring(0, 20) + '...');
        
        log.debug('Cache hit for route', { 
          path: req.path, 
          method: req.method 
        });
        
        return res.json(cached);
      }
    } catch (error) {
      log.error('Cache middleware error', { error, cacheKey });
      // Continue without cache on error
    }
    
    // Capture response
    const originalJson = res.json;
    res.json = function(data: any) {
      res.setHeader('X-Cache', 'MISS');
      
      // Cache successful responses
      if (res.statusCode === 200 && data) {
        const tags = options.tags ? options.tags(req) : [];
        
        cacheService.set(cacheKey, data, { 
          ttl: options.ttl || 300,
          tags 
        }).catch(error => {
          log.error('Failed to cache response', { error, cacheKey });
        });
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * User-aware cache middleware
 */
export function userCacheMiddleware(options: Omit<CacheMiddlewareOptions, 'keyGenerator' | 'tags'> = {}) {
  return cacheMiddleware({
    ...options,
    keyGenerator: (req) => {
      const userId = (req as any).userId || 'anonymous';
      return `route:${userId}:${req.path}:${JSON.stringify(req.query)}`;
    },
    tags: (req) => {
      const userId = (req as any).userId;
      return userId ? [`user:${userId}`] : [];
    },
    condition: (req) => {
      // Only cache for authenticated users
      return !!(req as any).userId;
    }
  });
}

/**
 * Invalidate cache middleware - for mutations
 */
export function cacheInvalidateMiddleware(patterns: string[] | ((req: Request) => string[])) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Capture response
    const originalJson = res.json;
    res.json = function(data: any) {
      // Invalidate cache on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const patternsToInvalidate = typeof patterns === 'function' 
          ? patterns(req) 
          : patterns;
          
        // Invalidate patterns asynchronously
        Promise.all(
          patternsToInvalidate.map(pattern => 
            cacheService.invalidate(pattern)
          )
        ).catch(error => {
          log.error('Cache invalidation error', { error, patterns: patternsToInvalidate });
        });
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Cache control headers middleware
 */
export function cacheHeaders(maxAge: number = 0, options: {
  public?: boolean;
  immutable?: boolean;
  mustRevalidate?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];
    
    if (options.public) {
      directives.push('public');
    } else {
      directives.push('private');
    }
    
    if (maxAge > 0) {
      directives.push(`max-age=${maxAge}`);
    } else {
      directives.push('no-cache');
    }
    
    if (options.immutable) {
      directives.push('immutable');
    }
    
    if (options.mustRevalidate) {
      directives.push('must-revalidate');
    }
    
    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };
}