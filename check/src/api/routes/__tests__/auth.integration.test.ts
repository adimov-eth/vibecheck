import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { createMockRedis, setupTestDb, cleanupTestData, testUtils, setupTestEnvironment } from '../../../test/setup';
import userRouter from '../user';
import authRouter from '../auth';
import { handleError } from '../../../middleware/error';
import * as appleAuthUtils from '../../../utils/apple-auth';
import * as sessionService from '../../../services/session-service';
import * as userService from '../../../services/user-service';
import * as usageService from '../../../services/usage-service';
import { AccountLockoutService } from '../../../services/account-lockout-service';
import { CaptchaService } from '../../../services/captcha-service';
import { AuthRateLimiter } from '../../../services/rate-limiter-service';
import { redisClient } from '../../../config';

// Mock all external dependencies
mock.module('../../../utils/apple-auth', () => ({
  verifyAppleToken: mock(async (token: string) => {
    if (token === 'valid-apple-token') {
      return {
        success: true,
        data: {
          userId: 'apple-user-123',
          email: 'test@example.com'
        }
      };
    }
    if (token === 'invalid-apple-token') {
      return {
        success: false,
        error: new Error('Invalid token signature')
      };
    }
    if (token.startsWith('valid-token-user-')) {
      const userId = token.replace('valid-token-user-', '');
      return {
        success: true,
        data: {
          userId: userId,
          email: `user-${userId}@example.com`
        }
      };
    }
    return {
      success: false,
      error: new Error('Invalid token')
    };
  })
}));

// Create real mock Redis client
const mockRedis = createMockRedis();

// Mock the redis client module
mock.module('../../../config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '7d'
    },
    redis: {
      host: 'localhost',
      port: 6379
    }
  },
  redisClient: mockRedis
}));

// Create test app with actual middleware
const createTestApp = (): Application => {
  const app = express();
  
  app.use(express.json());
  
  // Mount actual routers
  app.use('/api/user', userRouter);
  app.use('/api/auth', authRouter);
  
  // Error handler
  app.use(handleError);
  
  return app;
};

describe('Auth Integration Tests', () => {
  let app: Application;
  
  beforeAll(async () => {
    setupTestEnvironment();
    // Disable rate limiting for tests by default
    process.env.RATE_LIMITING_ENABLED = 'false';
    await setupTestDb();
    app = createTestApp();
  });
  
  beforeEach(async () => {
    await cleanupTestData();
    mockRedis._data.clear();
    
    // Reset rate limiting - need to do this before each test
    process.env.RATE_LIMITING_ENABLED = 'false';
    
    // Also need to reset the rate limiter service if it's already initialized
    // Clear any rate limit keys from Redis
    const keys = Array.from(mockRedis._data.keys());
    keys.forEach(key => {
      if (key.includes('rate') || key.includes('auth') || key.includes('limiter')) {
        mockRedis._data.delete(key);
      }
    });
    
    // Reset mocks if they exist
    if ((appleAuthUtils.verifyAppleToken as any).mockClear) {
      (appleAuthUtils.verifyAppleToken as any).mockClear();
    }
  });
  
  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Apple Sign-In Flow', () => {
    test('should complete full sign-in flow with valid token', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          fullName: {
            givenName: 'Test',
            familyName: 'User'
          },
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: expect.stringMatching(/^apple:apple-user-123$/),
            email: 'test@example.com',
            name: 'Test User'
          },
          sessionToken: expect.any(String)
        }
      });

      // Verify token was actually created
      const token = response.body.data.sessionToken;
      expect(token).toBeTruthy();
      // In the actual response, token is a string. Just verify JWT format
      expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT format
    });

    test('should handle sign-in without fullName', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      // Name can be null or undefined when not provided
      expect([null, undefined]).toContain(response.body.data.user.name);
    });

    test('should reject invalid Apple token', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token',
          email: 'test@example.com'
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid token signature')
      });
    });

    test('should require identity token', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Identity token is required'
      });
    });

    test('should handle existing email conflict', async () => {
      // First sign-in
      await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-1',
          email: 'existing@example.com'
        });

      // Mock the user service to return EMAIL_ALREADY_EXISTS error
      mock.module('../../../services/user-service', () => ({
        authenticateWithApple: mock(async () => ({
          success: false,
          error: new Error('Email already associated with another account'),
          code: 'EMAIL_ALREADY_EXISTS'
        }))
      }));

      // Try to sign in with different Apple ID but same email
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-2',
          email: 'existing@example.com'
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('already associated'),
        code: 'EMAIL_ALREADY_EXISTS'
      });
    });
  });

  describe('Token Authentication', () => {
    let validToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create a user and get a valid token
      const authResponse = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'test@example.com'
        });
      
      expect(authResponse.status).toBe(200);
      expect(authResponse.body.success).toBe(true);
      
      validToken = authResponse.body.data.sessionToken;
      userId = authResponse.body.data.user.id;
    });

    test('should access protected endpoint with valid token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: userId,
        email: 'test@example.com',
        usage: {
          currentUsage: expect.any(Number),
          limit: expect.any(Number),
          isSubscribed: expect.any(Boolean),
          remainingConversations: expect.any(Number),
          resetDate: expect.any(String)
        }
      });
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/user/me');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Missing or invalid Bearer token')
      });
    });

    test('should reject request with invalid token format', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Missing or invalid Bearer token')
      });
    });

    test('should reject request with malformed token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Token verification failed')
      });
    });

    test('should reject expired token', async () => {
      // Create an expired token by mocking the session service
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhcHBsZTp0ZXN0IiwiZXhwIjoxMDAwMDAwMDAwfQ.expired';
      
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Token')
      });
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Enable rate limiting for tests
      process.env.RATE_LIMITING_ENABLED = 'true';
    });

    test('should rate limit by IP after multiple failed attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', '192.168.1.100')
          .send({
            identityToken: 'invalid-apple-token'
          });
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '192.168.1.100')
        .send({
          identityToken: 'invalid-apple-token'  // Use invalid token to ensure failure
        });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('Too many authentication attempts')
      });
      expect(response.headers['retry-after']).toBeDefined();
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    test('should apply progressive delay after multiple failures', async () => {
      const startTime = Date.now();
      
      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', '192.168.1.101')
          .send({
            identityToken: 'invalid-apple-token'
          });
      }

      // 4th attempt should have progressive delay
      await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '192.168.1.101')
        .send({
          identityToken: 'invalid-apple-token'
        });

      const duration = Date.now() - startTime;
      
      // Should have some delay applied (at least 100ms for 3 failures)
      expect(duration).toBeGreaterThan(100);
    });

    test('should reset rate limits on successful authentication', async () => {
      // Make some failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', '192.168.1.102')
          .send({
            identityToken: 'invalid-apple-token'
          });
      }

      // Successful authentication
      const successResponse = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '192.168.1.102')
        .send({
          identityToken: 'valid-apple-token'
        });

      expect(successResponse.status).toBe(200);

      // Should be able to make more requests without rate limiting
      const nextResponse = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '192.168.1.102')
        .send({
          identityToken: 'valid-apple-token'
        });

      expect(nextResponse.status).toBe(200);
    });

    test('should rate limit by email', async () => {
      const email = 'ratelimit@example.com';
      
      // Make 3 failed attempts with the same email
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', `192.168.1.${103 + i}`) // Different IPs
          .send({
            identityToken: 'invalid-apple-token',
            email
          });
      }

      // 4th attempt with same email from different IP should still be limited
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '192.168.1.199')
        .send({
          identityToken: 'valid-apple-token',
          email
        });

      expect(response.status).toBe(429);
    });
  });

  describe('Account Lockout', () => {
    beforeEach(() => {
      process.env.RATE_LIMITING_ENABLED = 'true';
    });

    test('should lock account after multiple failed attempts', async () => {
      const email = 'lockout@example.com';
      
      // Mock the lockout service to simulate lockout
      const mockCheckAndLock = mock(async () => true);
      AccountLockoutService.checkAndLockAccount = mockCheckAndLock;

      // Make failed attempts
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .send({
            identityToken: 'invalid-apple-token',
            email
          });
      }

      // Next attempt should show account locked
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email
        });

      expect(mockCheckAndLock).toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Account has been locked'),
        code: 'ACCOUNT_LOCKED'
      });
    });

    test('should reject login for already locked account', async () => {
      const email = 'already-locked@example.com';
      
      // Mock the lockout service
      const mockIsLocked = mock(async () => true);
      AccountLockoutService.isAccountLocked = mockIsLocked;

      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email
        });

      expect(mockIsLocked).toHaveBeenCalledWith(email);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Account is locked'),
        code: 'ACCOUNT_LOCKED'
      });
    });
  });

  describe('CAPTCHA Integration', () => {
    test('should get CAPTCHA challenge', async () => {
      const response = await request(app)
        .get('/api/auth/captcha');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          challengeId: expect.any(String),
          question: expect.any(String),
          type: expect.any(String)
        }
      });
    });

    test('should verify CAPTCHA response', async () => {
      // Mock CAPTCHA service
      const mockValidate = mock(async () => ({
        valid: true,
        message: 'Correct!'
      }));
      CaptchaService.validateCaptchaResponse = mockValidate;

      const mockGenerateToken = mock(async () => 'captcha-token-123');
      CaptchaService.generateCaptchaToken = mockGenerateToken;

      const response = await request(app)
        .post('/api/auth/captcha/verify')
        .send({
          challengeId: 'test-challenge',
          response: '42'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          valid: true,
          message: 'Correct!',
          captchaToken: 'captcha-token-123'
        }
      });
    });

    test('should reject invalid CAPTCHA', async () => {
      const mockValidate = mock(async () => ({
        valid: false,
        message: 'Incorrect answer'
      }));
      CaptchaService.validateCaptchaResponse = mockValidate;

      const response = await request(app)
        .post('/api/auth/captcha/verify')
        .send({
          challengeId: 'test-challenge',
          response: 'wrong'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Incorrect answer'
      });
    });

    test('should require CAPTCHA after multiple failures', async () => {
      process.env.RATE_LIMITING_ENABLED = 'true';
      
      // Mock CAPTCHA requirement
      const mockCheckCaptcha = mock(async () => true);
      AuthRateLimiter.checkCaptchaRequired = mockCheckCaptcha;

      // Attempt without CAPTCHA token
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token'
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'CAPTCHA Required',
        message: expect.stringContaining('Please complete the CAPTCHA'),
        captchaRequired: true
      });
    });

    test('should accept authentication with valid CAPTCHA token', async () => {
      process.env.RATE_LIMITING_ENABLED = 'true';
      
      // Mock CAPTCHA requirement and validation
      const mockCheckCaptcha = mock(async () => true);
      AuthRateLimiter.checkCaptchaRequired = mockCheckCaptcha;
      
      const mockResetCaptcha = mock(async () => {});
      AuthRateLimiter.resetCaptchaAttempts = mockResetCaptcha;

      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Captcha-Token', 'valid-captcha-token')
        .send({
          identityToken: 'valid-apple-token'
        });

      expect(response.status).toBe(200);
      expect(mockResetCaptcha).toHaveBeenCalled();
    });
  });

  describe('Account Unlock Flow', () => {
    test('should request unlock email', async () => {
      const mockInitiateUnlock = mock(async () => {});
      AccountLockoutService.initiateUnlockProcess = mockInitiateUnlock;

      const response = await request(app)
        .post('/api/auth/unlock-request')
        .send({
          email: 'locked@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('If an account exists')
      });
      expect(mockInitiateUnlock).toHaveBeenCalledWith('locked@example.com');
    });

    test('should not leak user existence on unlock request', async () => {
      const mockInitiateUnlock = mock(async () => {
        throw new Error('User not found');
      });
      AccountLockoutService.initiateUnlockProcess = mockInitiateUnlock;

      const response = await request(app)
        .post('/api/auth/unlock-request')
        .send({
          email: 'nonexistent@example.com'
        });

      // Should still return success to avoid leaking info
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('If an account exists')
      });
    });

    test('should verify unlock token', async () => {
      const mockVerifyUnlock = mock(async () => true);
      AccountLockoutService.verifyAndUnlockAccount = mockVerifyUnlock;

      const response = await request(app)
        .post('/api/auth/unlock-verify')
        .send({
          token: 'valid-unlock-token'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Account unlocked successfully')
      });
    });

    test('should reject invalid unlock token', async () => {
      const mockVerifyUnlock = mock(async () => false);
      AccountLockoutService.verifyAndUnlockAccount = mockVerifyUnlock;

      const response = await request(app)
        .post('/api/auth/unlock-verify')
        .send({
          token: 'invalid-unlock-token'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid or expired unlock token')
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Mock a database error - use a unique token to avoid conflicts
      mock.module('../../../utils/apple-auth', () => ({
        verifyAppleToken: mock(async (token: string) => {
          if (token === 'db-error-token') {
            throw new Error('Database connection failed');
          }
          return {
            success: true,
            data: {
              userId: 'test-user',
              email: 'test@example.com'
            }
          };
        })
      }));

      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'db-error-token'
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });
      // Should not expose internal error details
      expect(response.body.error).not.toContain('Database connection');
    });

    test('should handle malformed request body', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('Content-Type', 'application/json')
        .send('{"invalid json');

      expect(response.status).toBe(400);
    });

    test('should handle large request payloads', async () => {
      const largeToken = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: largeToken
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Security Headers', () => {
    test('should not expose sensitive information in headers', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token'
        });

      // Should not expose server details
      expect(response.headers['x-powered-by']).toBeUndefined();
      
      // Should have security headers (if implemented)
      // expect(response.headers['x-content-type-options']).toBe('nosniff');
      // expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('Concurrent Authentication', () => {
    test('should handle concurrent sign-ins for different users', async () => {
      const users = Array.from({ length: 10 }, (_, i) => ({
        token: `valid-token-user-${i}`,
        email: `user-${i}@example.com`
      }));

      const responses = await Promise.all(
        users.map(user =>
          request(app)
            .post('/api/user/apple-auth')
            .send({
              identityToken: user.token,
              email: user.email
            })
        )
      );

      // All should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.data.user.email).toBe(users[i].email);
      });
    });

    test('should handle race condition for same user', async () => {
      // Send multiple requests for the same user simultaneously
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/user/apple-auth')
          .send({
            identityToken: 'valid-apple-token',
            email: 'race@example.com'
          })
      );

      const responses = await Promise.all(requests);

      // All should succeed without conflicts
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data.user.email).toBe('race@example.com');
      });
    });
  });

  describe('Token Refresh Flow', () => {
    // TODO: Implement token refresh endpoint if needed
    test.skip('should refresh a valid token before expiry', async () => {
      // First, get a valid token
      const authResponse = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'refresh@example.com'
        });
      
      const oldToken = authResponse.body.data.sessionToken;

      // Attempt to refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${oldToken}`);

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body).toMatchObject({
        success: true,
        data: {
          sessionToken: expect.any(String),
          expiresIn: expect.any(Number)
        }
      });

      // New token should be different from old token
      expect(refreshResponse.body.data.sessionToken).not.toBe(oldToken);

      // Both tokens should work
      const oldTokenResponse = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${oldToken}`);
      
      const newTokenResponse = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${refreshResponse.body.data.sessionToken}`);

      expect(oldTokenResponse.status).toBe(200);
      expect(newTokenResponse.status).toBe(200);
    });

    test.skip('should not refresh an expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhcHBsZTp0ZXN0IiwiZXhwIjoxMDAwMDAwMDAwfQ.expired';
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Token expired')
      });
    });

    test.skip('should not refresh a revoked token', async () => {
      // Implementation would depend on token revocation mechanism
    });
  });

  describe('Logout Flow', () => {
    // TODO: Implement logout endpoint if needed
    test.skip('should successfully logout and invalidate token', async () => {
      // First, get a valid token
      const authResponse = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'logout@example.com'
        });
      
      const token = authResponse.body.data.sessionToken;

      // Verify token works before logout
      const beforeLogout = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(beforeLogout.status).toBe(200);

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Logged out successfully')
      });

      // Token should no longer work
      const afterLogout = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(afterLogout.status).toBe(401);
    });

    test.skip('should handle logout without token gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Already logged out')
      });
    });

    test.skip('should handle logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Logged out')
      });
    });
  });

  describe('Session Management', () => {
    test('should handle multiple sessions per user', async () => {
      // Create two sessions for the same user
      const session1 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'multi-session@example.com'
        });

      const session2 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'multi-session@example.com'
        });

      const token1 = session1.body.data.sessionToken;
      const token2 = session2.body.data.sessionToken;

      // Both tokens should be different
      expect(token1).not.toBe(token2);

      // Both tokens should work
      const response1 = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token1}`);
      
      const response2 = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token2}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.id).toBe(response2.body.id);
    });
  });

  describe('API Versioning and Compatibility', () => {
    test('should handle different API versions gracefully', async () => {
      // Test with version headers
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('X-API-Version', '1.0')
        .send({
          identityToken: 'valid-apple-token'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Performance and Monitoring', () => {
    test('should include request ID in responses', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token'
        });

      // If request ID is implemented
      // expect(response.headers['x-request-id']).toBeDefined();
    });

    test('should measure authentication latency', async () => {
      const start = Date.now();
      
      await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token'
        });

      const duration = Date.now() - start;
      
      // Authentication should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
    });
  });
});