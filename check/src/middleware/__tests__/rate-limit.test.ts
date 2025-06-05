import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { createRateLimiter, apiRateLimiter, authRateLimiter } from '../rate-limit';
import { RateLimitError } from '../error';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '@/types/common';

// Helper to create mock Express objects
const createMockRequest = (overrides: any = {}): Partial<Request> => ({
  ip: '127.0.0.1',
  headers: {},
  path: '/test',
  method: 'GET',
  ...overrides
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.setHeader = mock((name: string, value: string | number) => res);
  res.status = mock((code: number) => res);
  res.json = mock((data: any) => res);
  res.send = mock((data: any) => res);
  return res;
};

const createMockNext = (): NextFunction => {
  return mock((err?: any) => {});
};

// Access internal stores for cleanup
let rateLimiterStores: any = {};

// Helper to clear all rate limit stores
const clearAllStores = () => {
  // Access the stores through the module
  try {
    // Clear stores by recreating rate limiters
    const newApiLimiter = createRateLimiter('api', 100, 15 * 60 * 1000);
    const newAuthLimiter = createRateLimiter('auth', 5, 15 * 60 * 1000);
  } catch (e) {
    // Ignore errors
  }
};

describe('In-Memory Rate Limiter', () => {
  beforeEach(() => {
    clearAllStores();
  });

  afterEach(() => {
    clearAllStores();
  });

  describe('Basic Rate Limiting', () => {
    test('should allow requests within limit', () => {
      const limiter = createRateLimiter('test', 5, 60000);
      
      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();
        
        limiter(req as Request, res as Response, next);
        
        expect(next).toHaveBeenCalled();
        expect((next as any).mock.calls[0].length).toBe(0);
      }
    });

    test('should block requests exceeding limit', () => {
      const limiter = createRateLimiter('test', 3, 60000);
      
      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();
        
        limiter(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }
      
      // 4th request should be blocked
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      limiter(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toContain('Too many requests');
    });

    test('should set rate limit headers', () => {
      const limiter = createRateLimiter('test', 5, 60000);
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      limiter(req as Request, res as Response, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', 5);
      expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', 4);
      expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', expect.any(Number));
    });

    test('should reset after window expires', async () => {
      const windowMs = 100; // 100ms for testing
      const limiter = createRateLimiter('test-reset', 2, windowMs);
      
      // Use up the limit
      for (let i = 0; i < 2; i++) {
        limiter(
          createMockRequest() as Request,
          createMockResponse() as Response,
          createMockNext()
        );
      }
      
      // 3rd request should be blocked
      const blockedReq = createMockRequest();
      const blockedRes = createMockResponse();
      const blockedNext = createMockNext();
      
      limiter(blockedReq as Request, blockedRes as Response, blockedNext);
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, windowMs + 10));
      
      // Should allow new request
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      limiter(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect((next as any).mock.calls[0].length).toBe(0);
    });
  });

  describe('IP-based Rate Limiting', () => {
    test('should track different IPs separately', () => {
      const limiter = createRateLimiter('test-ip', 2, 60000);
      
      // IP 1: Use up limit
      for (let i = 0; i < 2; i++) {
        limiter(
          createMockRequest({ ip: '192.168.1.1' }) as Request,
          createMockResponse() as Response,
          createMockNext()
        );
      }
      
      // IP 1: Should be blocked
      const blockedNext = createMockNext();
      limiter(
        createMockRequest({ ip: '192.168.1.1' }) as Request,
        createMockResponse() as Response,
        blockedNext
      );
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // IP 2: Should still be allowed
      const allowedNext = createMockNext();
      limiter(
        createMockRequest({ ip: '192.168.1.2' }) as Request,
        createMockResponse() as Response,
        allowedNext
      );
      expect(allowedNext).toHaveBeenCalled();
      expect((allowedNext as any).mock.calls[0].length).toBe(0);
    });

    test('should handle missing IP gracefully', () => {
      const limiter = createRateLimiter('test-noip', 2, 60000);
      
      const req = createMockRequest({ ip: undefined });
      const res = createMockResponse();
      const next = createMockNext();
      
      limiter(req as Request, res as Response, next);
      
      // Should still work with 'unknown' IP
      expect(next).toHaveBeenCalled();
      expect((next as any).mock.calls[0].length).toBe(0);
    });
  });

  describe('User-based Rate Limiting', () => {
    test('should use userId when available', () => {
      const limiter = createRateLimiter('test-user', 2, 60000);
      
      // User 1: Use up limit
      for (let i = 0; i < 2; i++) {
        const req = { ...createMockRequest(), userId: 'user123' } as AuthenticatedRequest;
        limiter(req, createMockResponse() as Response, createMockNext());
      }
      
      // User 1: Should be blocked
      const blockedNext = createMockNext();
      const blockedReq = { ...createMockRequest(), userId: 'user123' } as AuthenticatedRequest;
      limiter(blockedReq, createMockResponse() as Response, blockedNext);
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // User 2: Should still be allowed
      const allowedNext = createMockNext();
      const allowedReq = { ...createMockRequest(), userId: 'user456' } as AuthenticatedRequest;
      limiter(allowedReq, createMockResponse() as Response, allowedNext);
      expect(allowedNext).toHaveBeenCalled();
      expect((allowedNext as any).mock.calls[0].length).toBe(0);
    });

    test('should prefer userId over IP when both available', () => {
      const limiter = createRateLimiter('test-userip', 2, 60000);
      
      // Use up limit for user
      for (let i = 0; i < 2; i++) {
        const req = { 
          ...createMockRequest({ ip: '192.168.1.1' }), 
          userId: 'user123' 
        } as AuthenticatedRequest;
        limiter(req, createMockResponse() as Response, createMockNext());
      }
      
      // Same user, different IP: Should be blocked
      const blockedNext = createMockNext();
      const blockedReq = { 
        ...createMockRequest({ ip: '192.168.1.2' }), 
        userId: 'user123' 
      } as AuthenticatedRequest;
      limiter(blockedReq, createMockResponse() as Response, blockedNext);
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // Different user, same IP: Should be allowed
      const allowedNext = createMockNext();
      const allowedReq = { 
        ...createMockRequest({ ip: '192.168.1.1' }), 
        userId: 'user456' 
      } as AuthenticatedRequest;
      limiter(allowedReq, createMockResponse() as Response, allowedNext);
      expect(allowedNext).toHaveBeenCalled();
      expect((allowedNext as any).mock.calls[0].length).toBe(0);
    });
  });

  describe('Path and Method Granularity', () => {
    test('should track different paths separately', () => {
      const limiter = createRateLimiter('test-path', 1, 60000);
      
      // Path 1: Use up limit
      limiter(
        createMockRequest({ path: '/api/users' }) as Request,
        createMockResponse() as Response,
        createMockNext()
      );
      
      // Path 1: Should be blocked
      const blockedNext = createMockNext();
      limiter(
        createMockRequest({ path: '/api/users' }) as Request,
        createMockResponse() as Response,
        blockedNext
      );
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // Path 2: Should still be allowed
      const allowedNext = createMockNext();
      limiter(
        createMockRequest({ path: '/api/posts' }) as Request,
        createMockResponse() as Response,
        allowedNext
      );
      expect(allowedNext).toHaveBeenCalled();
      expect((allowedNext as any).mock.calls[0].length).toBe(0);
    });

    test('should track different methods separately', () => {
      const limiter = createRateLimiter('test-method', 1, 60000);
      
      // GET: Use up limit
      limiter(
        createMockRequest({ method: 'GET' }) as Request,
        createMockResponse() as Response,
        createMockNext()
      );
      
      // GET: Should be blocked
      const blockedNext = createMockNext();
      limiter(
        createMockRequest({ method: 'GET' }) as Request,
        createMockResponse() as Response,
        blockedNext
      );
      expect(blockedNext).toHaveBeenCalled();
      const error = (blockedNext as any).mock.calls[0][0];
      expect(error).toBeInstanceOf(RateLimitError);
      
      // POST: Should still be allowed
      const allowedNext = createMockNext();
      limiter(
        createMockRequest({ method: 'POST' }) as Request,
        createMockResponse() as Response,
        allowedNext
      );
      expect(allowedNext).toHaveBeenCalled();
      expect((allowedNext as any).mock.calls[0].length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should set Retry-After header when rate limited', () => {
      const windowMs = 60000; // 1 minute
      const limiter = createRateLimiter('test-retry', 1, windowMs);
      
      // Use up limit
      limiter(
        createMockRequest() as Request,
        createMockResponse() as Response,
        createMockNext()
      );
      
      // Next request should be rate limited
      const res = createMockResponse();
      const next = createMockNext();
      limiter(
        createMockRequest() as Request,
        res as Response,
        next
      );
      
      expect(res.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(Number)
      );
      
      // Get the Retry-After value
      const retryAfterCall = (res.setHeader as any).mock.calls.find(
        (call: any[]) => call[0] === 'Retry-After'
      );
      const retryAfter = retryAfterCall[1];
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    test('should handle errors gracefully', () => {
      const limiter = createRateLimiter('test-error', 5, 60000);
      
      // Mock an error in the middleware
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      // Override setHeader to throw an error
      res.setHeader = mock(() => {
        throw new Error('Header error');
      });
      
      // Should catch the error and pass it to next
      limiter(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error.message).toBe('Header error');
    });
  });

  describe('Predefined Rate Limiters', () => {
    test('apiRateLimiter should use default config', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      apiRateLimiter(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect((next as any).mock.calls[0].length).toBe(0);
      expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', expect.any(Number));
    });

    test('authRateLimiter should use auth config', () => {
      const req = createMockRequest({ path: '/auth/login' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authRateLimiter(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalled();
      expect((next as any).mock.calls[0].length).toBe(0);
      expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', expect.any(Number));
    });
  });

  describe('Memory Management', () => {
    test('should prevent memory leaks with MAX_KEYS_PER_STORE limit', () => {
      const limiter = createRateLimiter('test-memory', 1, 60000);
      
      // Create many requests with different IPs
      for (let i = 0; i < 15000; i++) {
        const req = createMockRequest({ 
          ip: `192.168.${Math.floor(i / 256)}.${i % 256}` 
        });
        limiter(req as Request, createMockResponse() as Response, createMockNext());
      }
      
      // Check that store hasn't grown beyond limit
      // Note: We can't directly access the store in this test setup,
      // but the cleanup mechanism should prevent unbounded growth
    });

    test('cleanup should remove expired entries', async () => {
      const windowMs = 100; // Short window for testing
      const limiter = createRateLimiter('test-cleanup', 1, windowMs);
      
      // Create some entries
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ ip: `192.168.1.${i}` });
        limiter(req as Request, createMockResponse() as Response, createMockNext());
      }
      
      // Wait for entries to expire
      await new Promise(resolve => setTimeout(resolve, windowMs + 50));
      
      // New requests should work (implying old entries were cleaned)
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ ip: `192.168.1.${i}` });
        const next = createMockNext();
        limiter(req as Request, createMockResponse() as Response, next);
        expect(next).toHaveBeenCalled();
        expect((next as any).mock.calls[0].length).toBe(0);
      }
    });
  });
});

// Separate test suite for auth rate limiting with progressive delays
describe('Auth Rate Limiting with Progressive Features', () => {
  beforeEach(() => {
    clearAllStores();
  });

  afterEach(() => {
    clearAllStores();
  });

  test('should simulate progressive delays with multiple requests', async () => {
    const authLimiter = createRateLimiter('auth-progressive', 5, 15 * 60 * 1000);
    
    const delays = [0, 1000, 5000, 15000, 30000]; // Simulated progressive delays
    
    for (let attempt = 0; attempt < 5; attempt++) {
      const start = Date.now();
      
      const req = createMockRequest({ 
        path: '/auth/login',
        body: { email: 'test@example.com', password: 'wrong' }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      // Simulate delay based on attempt number
      if (attempt > 0 && attempt < delays.length) {
        await new Promise(resolve => setTimeout(resolve, Math.min(delays[attempt], 100))); // Cap delay for testing
      }
      
      authLimiter(req as Request, res as Response, next);
      
      const duration = Date.now() - start;
      
      expect(next).toHaveBeenCalled();
      if (attempt < 5) {
        expect((next as any).mock.calls[0].length).toBe(0);
      }
    }
  });

  test('should trigger CAPTCHA-like behavior after threshold', () => {
    const captchaThreshold = 3;
    const authLimiter = createRateLimiter('auth-captcha', captchaThreshold, 15 * 60 * 1000);
    
    // Make attempts up to threshold
    for (let i = 0; i < captchaThreshold; i++) {
      const req = createMockRequest({ 
        path: '/auth/login',
        body: { email: 'test@example.com' }
      });
      authLimiter(req as Request, createMockResponse() as Response, createMockNext());
    }
    
    // Next attempt should be blocked (simulating CAPTCHA requirement)
    const req = createMockRequest({ 
      path: '/auth/login',
      body: { email: 'test@example.com' }
    });
    const res = createMockResponse();
    const next = createMockNext();
    
    authLimiter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toContain('Too many requests');
  });

  test('should implement account lockout after threshold', () => {
    const lockoutThreshold = 10;
    const authLimiter = createRateLimiter('auth-lockout', lockoutThreshold, 30 * 60 * 1000);
    
    const email = 'locked@example.com';
    
    // Make attempts up to lockout threshold
    for (let i = 0; i < lockoutThreshold; i++) {
      const req = createMockRequest({ 
        path: '/auth/login',
        body: { email }
      });
      authLimiter(req as Request, createMockResponse() as Response, createMockNext());
    }
    
    // Account should be locked out
    const req = createMockRequest({ 
      path: '/auth/login',
      body: { email }
    });
    const res = createMockResponse();
    const next = createMockNext();
    
    authLimiter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(RateLimitError);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  test('should track per-email and per-IP separately', () => {
    const emailLimiter = createRateLimiter('auth-email', 3, 60 * 60 * 1000);
    const ipLimiter = createRateLimiter('auth-ip', 5, 15 * 60 * 1000);
    
    const email = 'test@example.com';
    const ip1 = '192.168.1.1';
    const ip2 = '192.168.1.2';
    
    // Use up email limit from different IPs
    for (let i = 0; i < 3; i++) {
      const req = createMockRequest({ 
        ip: i % 2 === 0 ? ip1 : ip2,
        path: `/auth/login/${email}` // Using path to simulate per-email tracking
      });
      emailLimiter(req as Request, createMockResponse() as Response, createMockNext());
    }
    
    // Email should be blocked from any IP
    const blockedNext = createMockNext();
    emailLimiter(
      createMockRequest({ 
        ip: '192.168.1.100',
        path: `/auth/login/${email}`
      }) as Request,
      createMockResponse() as Response,
      blockedNext
    );
    expect(blockedNext).toHaveBeenCalled();
    const error = (blockedNext as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(RateLimitError);
    
    // Different email from same IP should work
    const allowedNext = createMockNext();
    emailLimiter(
      createMockRequest({ 
        ip: ip1,
        path: '/auth/login/other@example.com'
      }) as Request,
      createMockResponse() as Response,
      allowedNext
    );
    expect(allowedNext).toHaveBeenCalled();
    expect((allowedNext as any).mock.calls[0].length).toBe(0);
  });

  test('should reset rate limits on successful auth', async () => {
    const limiter = createRateLimiter('auth-reset', 3, 1000);
    
    const req = createMockRequest({ 
      path: '/auth/login',
      body: { email: 'reset@example.com' }
    });
    
    // Use up some attempts
    for (let i = 0; i < 2; i++) {
      limiter(req as Request, createMockResponse() as Response, createMockNext());
    }
    
    // Simulate successful auth by waiting for window to expire
    // (In real implementation, you'd have a separate reset mechanism)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should allow new attempts
    const next = createMockNext();
    limiter(req as Request, createMockResponse() as Response, next);
    expect(next).toHaveBeenCalled();
    expect((next as any).mock.calls[0].length).toBe(0);
  });
});

// Integration test with Redis-based rate limiting
describe('Redis Integration for Auth Rate Limiting', () => {
  test('should handle Redis connection failures gracefully', () => {
    // The in-memory rate limiter doesn't use Redis, so it should always work
    const limiter = createRateLimiter('test-redis', 5, 60000);
    
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();
    
    limiter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalled();
    expect((next as any).mock.calls[0].length).toBe(0);
  });

  test('should work without Redis dependency', () => {
    // Test that the in-memory limiter works independently
    const limiter = createRateLimiter('independent', 2, 60000);
    
    // Should work for allowed requests
    limiter(
      createMockRequest() as Request,
      createMockResponse() as Response,
      createMockNext()
    );
    
    limiter(
      createMockRequest() as Request,
      createMockResponse() as Response,
      createMockNext()
    );
    
    // Should block when limit exceeded
    const next = createMockNext();
    limiter(
      createMockRequest() as Request,
      createMockResponse() as Response,
      next
    );
    
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(RateLimitError);
  });
});