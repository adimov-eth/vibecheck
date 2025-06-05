import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Request, Response, NextFunction } from 'express';
import { cacheMiddleware, userCacheMiddleware, cacheInvalidateMiddleware } from '../cache';
import { cacheService } from '@/services/cache/cache-service';

describe('Cache Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: any;
  
  beforeEach(async () => {
    await cacheService.connect();
    await cacheService.clear();
    
    req = {
      method: 'GET',
      path: '/test',
      query: {},
      userId: 'user123'
    } as any;
    
    jsonMock = mock(() => {});
    res = {
      json: jsonMock,
      setHeader: mock(() => {}),
      statusCode: 200
    } as any;
    
    next = mock(() => {});
  });
  
  afterEach(async () => {
    await cacheService.clear();
    await cacheService.disconnect();
  });
  
  describe('cacheMiddleware', () => {
    it('should skip non-GET requests', async () => {
      req.method = 'POST';
      const middleware = cacheMiddleware();
      
      await middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });
    
    it('should return cached response if exists', async () => {
      const cachedData = { data: 'cached' };
      const cacheKey = `route:${req.path}:${JSON.stringify(req.query)}`;
      
      await cacheService.set(cacheKey, cachedData);
      
      const middleware = cacheMiddleware();
      await middleware(req as Request, res as Response, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(jsonMock).toHaveBeenCalledWith(cachedData);
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should call next and cache response on miss', async () => {
      const responseData = { data: 'fresh' };
      const middleware = cacheMiddleware({ ttl: 60 });
      
      // Override res.json to simulate response
      res.json = function(data: any) {
        expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
        expect(data).toEqual(responseData);
        return this as Response;
      };
      
      await middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      
      // Simulate the route handler calling res.json
      res.json(responseData);
      
      // Wait for async cache operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify data was cached
      const cacheKey = `route:${req.path}:${JSON.stringify(req.query)}`;
      const cached = await cacheService.get(cacheKey);
      expect(cached).toEqual(responseData);
    });
    
    it('should use custom key generator', async () => {
      const customKey = 'custom:key';
      const middleware = cacheMiddleware({
        keyGenerator: () => customKey
      });
      
      const cachedData = { custom: true };
      await cacheService.set(customKey, cachedData);
      
      await middleware(req as Request, res as Response, next);
      
      expect(jsonMock).toHaveBeenCalledWith(cachedData);
    });
    
    it('should respect condition function', async () => {
      const middleware = cacheMiddleware({
        condition: (req) => req.path === '/cached'
      });
      
      req.path = '/not-cached';
      
      await middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });
  });
  
  describe('userCacheMiddleware', () => {
    it('should include userId in cache key', async () => {
      const middleware = userCacheMiddleware({ ttl: 300 });
      const userId = 'user456';
      req.userId = userId;
      
      const responseData = { user: 'data' };
      
      res.json = function(data: any) {
        return this as Response;
      };
      
      await middleware(req as Request, res as Response, next);
      res.json(responseData);
      
      // Wait for async cache
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cacheKey = `route:${userId}:${req.path}:${JSON.stringify(req.query)}`;
      const cached = await cacheService.get(cacheKey);
      expect(cached).toEqual(responseData);
    });
    
    it('should skip caching for unauthenticated requests', async () => {
      delete req.userId;
      
      const middleware = userCacheMiddleware();
      await middleware(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
    });
  });
  
  describe('cacheInvalidateMiddleware', () => {
    it('should invalidate patterns on successful response', async () => {
      const patterns = ['pattern1:*', 'pattern2:*'];
      const middleware = cacheInvalidateMiddleware(patterns);
      
      // Pre-cache some data
      await cacheService.set('pattern1:test', 'data1');
      await cacheService.set('pattern2:test', 'data2');
      await cacheService.set('other:test', 'data3');
      
      res.json = function(data: any) {
        // Wait for invalidation
        setTimeout(async () => {
          expect(await cacheService.get('pattern1:test')).toBeNull();
          expect(await cacheService.get('pattern2:test')).toBeNull();
          expect(await cacheService.get('other:test')).not.toBeNull();
        }, 100);
        
        return this as Response;
      };
      
      await middleware(req as Request, res as Response, next);
      res.json({ success: true });
    });
    
    it('should use pattern function if provided', async () => {
      const middleware = cacheInvalidateMiddleware((req) => {
        return [`user:${(req as any).userId}:*`];
      });
      
      req.userId = 'user789';
      
      await cacheService.set('user:user789:profile', 'data');
      
      res.json = function(data: any) {
        setTimeout(async () => {
          expect(await cacheService.get('user:user789:profile')).toBeNull();
        }, 100);
        
        return this as Response;
      };
      
      await middleware(req as Request, res as Response, next);
      res.json({ updated: true });
    });
    
    it('should not invalidate on error response', async () => {
      const patterns = ['error:*'];
      const middleware = cacheInvalidateMiddleware(patterns);
      
      await cacheService.set('error:test', 'should-remain');
      
      res.statusCode = 500;
      res.json = function(data: any) {
        setTimeout(async () => {
          expect(await cacheService.get('error:test')).not.toBeNull();
        }, 100);
        
        return this as Response;
      };
      
      await middleware(req as Request, res as Response, next);
      res.json({ error: 'Failed' });
    });
  });
});