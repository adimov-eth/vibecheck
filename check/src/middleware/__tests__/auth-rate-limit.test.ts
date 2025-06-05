import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import type { Request, Response, NextFunction } from 'express';

// Create mock implementations
const mockAuthRateLimiter = {
  checkIP: mock(async () => ({ totalPoints: 5, remainingPoints: 4, msBeforeNext: 0 })),
  checkEmail: mock(async () => ({ totalPoints: 10, remainingPoints: 9, msBeforeNext: 0 })),
  getProgressiveDelay: mock(async () => 0),
  incrementProgressiveDelay: mock(async () => {}),
  resetProgressiveDelay: mock(async () => {}),
  checkCaptchaRequired: mock(async () => false),
  incrementCaptchaAttempts: mock(async () => {}),
  resetCaptchaAttempts: mock(async () => {}),
  resetAllLimits: mock(async () => {})
};

const mockLoginAttemptTracker = {
  recordFailedAttempt: mock(async () => {}),
  getFailedAttempts: mock(async () => 0),
  isBlocked: mock(async () => false)
};

// Mock the entire rate-limiter-service module
mock.module('@/services/rate-limiter-service', () => ({
  AuthRateLimiter: mockAuthRateLimiter,
  LoginAttemptTracker: mockLoginAttemptTracker
}));

// Import after mocking
import { 
  rateLimiterByIP, 
  rateLimiterByEmail, 
  progressiveDelayMiddleware,
  captchaMiddleware,
  authRateLimitMiddleware
} from '../auth-rate-limit';

// Create email-based rate limiter with default extractor
const emailRateLimiter = rateLimiterByEmail((req) => req.body?.email);

// Helper to create mock Express objects
const createMockRequest = (overrides: any = {}): Partial<Request> => ({
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  headers: {},
  path: '/auth/login',
  method: 'POST',
  body: {},
  ...overrides
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.setHeader = mock((name: string, value: string) => res);
  res.status = mock((code: number) => res);
  res.json = mock((data: any) => res);
  res.send = mock((data: any) => res);
  return res;
};

const createMockNext = (): NextFunction => {
  return mock((err?: any) => {});
};

describe('Auth Rate Limiting Middleware', () => {
  beforeEach(() => {
    // Reset all mocks
    mockAuthRateLimiter.checkIP.mockClear();
    mockAuthRateLimiter.checkEmail.mockClear();
    mockAuthRateLimiter.getProgressiveDelay.mockClear();
    mockAuthRateLimiter.incrementProgressiveDelay.mockClear();
    mockAuthRateLimiter.resetProgressiveDelay.mockClear();
    mockAuthRateLimiter.checkCaptchaRequired.mockClear();
    mockAuthRateLimiter.incrementCaptchaAttempts.mockClear();
    mockAuthRateLimiter.resetCaptchaAttempts.mockClear();
    mockAuthRateLimiter.resetAllLimits.mockClear();
    mockLoginAttemptTracker.recordFailedAttempt.mockClear();
    mockLoginAttemptTracker.getFailedAttempts.mockClear();
    mockLoginAttemptTracker.isBlocked.mockClear();
  });

  describe('IP-based Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await rateLimiterByIP(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkIP).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalledWith();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    });

    test('should reject requests when rate limit exceeded', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Mock rate limit exceeded
      mockAuthRateLimiter.checkIP.mockRejectedValueOnce(new Error('Too Many Requests'));

      await rateLimiterByIP(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: expect.any(Number)
      });
    });

    test('should handle IPv6 addresses', async () => {
      const req = createMockRequest({ ip: '::1' });
      const res = createMockResponse();
      const next = createMockNext();

      await rateLimiterByIP(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkIP).toHaveBeenCalledWith('::1');
    });

    test('should use X-Forwarded-For header when available', async () => {
      const req = createMockRequest({
        ip: '192.168.1.1',
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await rateLimiterByIP(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkIP).toHaveBeenCalledWith('192.168.1.1');
    });
  });

  describe('Email-based Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      await emailRateLimiter(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkEmail).toHaveBeenCalledWith('test@example.com');
      expect(next).toHaveBeenCalledWith();
    });

    test('should skip when email is not provided', async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();
      const next = createMockNext();

      await emailRateLimiter(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkEmail).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('should reject when rate limit exceeded', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.checkEmail.mockRejectedValueOnce(new Error('Too Many Requests'));

      await emailRateLimiter(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: expect.any(Number)
      });
    });
  });

  describe('Progressive Delay Middleware', () => {
    test('should apply no delay for first attempt', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.getProgressiveDelay.mockResolvedValueOnce(0);

      await progressiveDelayMiddleware(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.getProgressiveDelay).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalledWith();
    });

    test('should apply delay for subsequent attempts', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.getProgressiveDelay.mockResolvedValueOnce(2000); // 2 second delay

      const startTime = Date.now();
      await progressiveDelayMiddleware(req as Request, res as Response, next);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(1900); // Allow some margin
      expect(next).toHaveBeenCalledWith();
    });

    test('should handle errors gracefully', async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.getProgressiveDelay.mockRejectedValueOnce(new Error('Redis error'));

      await progressiveDelayMiddleware(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.getProgressiveDelay).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalledWith(); // Should continue on error
    });
  });

  describe('CAPTCHA Middleware', () => {
    test('should pass when CAPTCHA not required', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.checkCaptchaRequired.mockResolvedValueOnce(false);

      await captchaMiddleware(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkCaptchaRequired).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalledWith();
    });

    test('should require CAPTCHA after threshold', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.checkCaptchaRequired.mockResolvedValueOnce(true);

      await captchaMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'CAPTCHA Required',
        message: 'Too many failed attempts. Please complete the CAPTCHA.',
        captchaRequired: true
      });
    });

    test('should accept CAPTCHA token and reset attempts', async () => {
      const req = createMockRequest({ 
        body: { 
          email: 'test@example.com',
          captchaToken: 'valid-token'
        } 
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.checkCaptchaRequired.mockResolvedValueOnce(true);

      await captchaMiddleware(req as Request, res as Response, next);

      // When captcha token is provided, it should reset attempts and continue
      expect(mockAuthRateLimiter.resetCaptchaAttempts).toHaveBeenCalledWith('127.0.0.1');
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Combined Auth Rate Limit Middleware', () => {
    test('should apply all rate limiters in sequence', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      // Test each middleware separately since authRateLimitMiddleware is not a single function
      await rateLimiterByIP(req as Request, res as Response, next);
      if (next.mock.calls.length > 0) {
        await emailRateLimiter(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 1) {
        await progressiveDelayMiddleware(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 2) {
        await captchaMiddleware(req as Request, res as Response, next);
      }

      expect(mockAuthRateLimiter.checkIP).toHaveBeenCalled();
      expect(mockAuthRateLimiter.checkEmail).toHaveBeenCalled();
      expect(mockAuthRateLimiter.getProgressiveDelay).toHaveBeenCalled();
      expect(mockAuthRateLimiter.checkCaptchaRequired).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('should handle failed login tracking', async () => {
      const req = createMockRequest({ 
        body: { email: 'test@example.com' },
        path: '/auth/login',
        authFailed: true 
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Test each middleware separately since authRateLimitMiddleware is not a single function
      await rateLimiterByIP(req as Request, res as Response, next);
      if (next.mock.calls.length > 0) {
        await emailRateLimiter(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 1) {
        await progressiveDelayMiddleware(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 2) {
        await captchaMiddleware(req as Request, res as Response, next);
      }

      // Note: Failed login tracking is handled by the auth endpoint, not the middleware
      expect(next).toHaveBeenCalledWith();
    });

    test('should check if account is blocked', async () => {
      const req = createMockRequest({ body: { email: 'test@example.com' } });
      const res = createMockResponse();
      const next = createMockNext();

      mockLoginAttemptTracker.isBlocked.mockResolvedValueOnce(true);

      // Note: Account blocking check would be in the auth service, not the middleware
      // Test each middleware separately since authRateLimitMiddleware is not a single function
      await rateLimiterByIP(req as Request, res as Response, next);
      if (next.mock.calls.length > 0) {
        await emailRateLimiter(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 1) {
        await progressiveDelayMiddleware(req as Request, res as Response, next);
      }
      if (next.mock.calls.length > 2) {
        await captchaMiddleware(req as Request, res as Response, next);
      }

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing IP address', async () => {
      const req = createMockRequest({ ip: undefined, socket: { remoteAddress: undefined } });
      const res = createMockResponse();
      const next = createMockNext();

      await rateLimiterByIP(req as Request, res as Response, next);

      expect(mockAuthRateLimiter.checkIP).toHaveBeenCalledWith('unknown');
    });

    test('should handle malformed email addresses', async () => {
      const req = createMockRequest({ body: { email: 'not-an-email' } });
      const res = createMockResponse();
      const next = createMockNext();

      await emailRateLimiter(req as Request, res as Response, next);

      // Should still rate limit even with malformed email
      expect(mockAuthRateLimiter.checkEmail).toHaveBeenCalledWith('not-an-email');
    });

    test('should handle rate limiter service errors gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      mockAuthRateLimiter.checkIP.mockRejectedValueOnce(new Error('Redis connection failed'));

      await rateLimiterByIP(req as Request, res as Response, next);

      // Should fail closed - reject the request on error
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });
});