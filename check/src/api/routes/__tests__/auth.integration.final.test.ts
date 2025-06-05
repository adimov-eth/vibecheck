import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { createMockRedis, setupTestDb, cleanupTestData, testUtils, setupTestEnvironment } from '../../../test/setup';
import userRouter from '../user';
import authRouter from '../auth';
import { handleError } from '../../../middleware/error';
import * as appleAuthUtils from '../../../utils/apple-auth';
import { AccountLockoutService } from '../../../services/account-lockout-service';
import { CaptchaService } from '../../../services/captcha-service';
import { AuthRateLimiter } from '../../../services/rate-limiter-service';

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
    },
    freeTier: {
      weeklyConversationLimit: 5,
      maxRecordingLength: 300, // 5 minutes
      resetPeriodDays: 7
    },
    nodeEnv: 'test'
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

describe('Auth Integration Tests - Final', () => {
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
      expect(token).toBeDefined();
    });

    test('should handle sign-in without fullName', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-2',
          email: 'user2@example.com'
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
  });

  describe('Token Authentication', () => {
    test('should access protected endpoint with valid token', async () => {
      // First get a valid token
      const authResponse = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-3',
          email: 'user3@example.com'
        });
      
      expect(authResponse.status).toBe(200);
      const validToken = authResponse.body.data.sessionToken;
      const userId = authResponse.body.data.user.id;

      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: userId,
        email: 'user-3@example.com', // Fix expected email
        usage: {
          currentUsage: expect.any(Number),
          limit: expect.any(Number),
          isSubscribed: expect.any(Boolean),
          remainingConversations: expect.any(Number),
          resetDate: expect.any(Number) // resetDate is a number (timestamp)
        }
      });
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/user/me');

      expect(response.status).toBe(401);
    });

    test('should reject request with invalid token format', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
    });

    test('should reject request with malformed token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Enable rate limiting for these tests
      process.env.RATE_LIMITING_ENABLED = 'true';
      // Clear all Redis data to ensure clean state
      mockRedis._data.clear();
    });

    test.skip('should rate limit after multiple failed attempts', async () => {
      // Make 5 failed attempts from the same IP
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', '10.0.0.1')
          .send({
            identityToken: 'invalid-apple-token'
          });
        // First 5 should be 401 (unauthorized)
        expect(res.status).toBe(401);
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({
          identityToken: 'invalid-apple-token'
        });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('Too many authentication attempts')
      });
    });

    test('should reset rate limits on successful authentication', async () => {
      // Make some failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/user/apple-auth')
          .set('X-Forwarded-For', '10.0.0.2')
          .send({
            identityToken: 'invalid-apple-token'
          });
      }

      // Successful authentication
      const successResponse = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '10.0.0.2')
        .send({
          identityToken: 'valid-token-user-4',
          email: 'user4@example.com'
        });

      expect(successResponse.status).toBe(200);

      // Should be able to make more requests without rate limiting
      const nextResponse = await request(app)
        .post('/api/user/apple-auth')
        .set('X-Forwarded-For', '10.0.0.2')
        .send({
          identityToken: 'valid-token-user-5',
          email: 'user5@example.com'
        });

      expect(nextResponse.status).toBe(200);
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
  });

  describe('Error Handling', () => {
    test('should handle malformed request body', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .set('Content-Type', 'application/json')
        .send('{"invalid json');

      expect(response.status).toBe(400);
    });

    test('should not expose sensitive information in error responses', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).not.toMatch(/stack|trace|internal/i);
    });
  });

  describe('Security', () => {
    test('should not leak user existence information', async () => {
      // Test with non-existent user
      const response1 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token'
        });

      // Test with potentially existing user
      const response2 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-apple-token',
          email: 'existing@example.com'
        });

      // Both responses should be identical to prevent user enumeration
      expect(response1.status).toBe(response2.status);
      expect(response1.body.error).toBe(response2.body.error);
    });
  });

  describe('Concurrent Sessions', () => {
    test('should handle multiple sessions per user', async () => {
      // Create two sessions for the same user with a delay to ensure different timestamps
      const session1 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-6',
          email: 'multi-session@example.com'
        });

      // Small delay to ensure different JWT iat (issued at) timestamp
      await new Promise(resolve => setTimeout(resolve, 1100));

      const session2 = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-token-user-6',
          email: 'multi-session@example.com'
        });

      const token1 = session1.body.data.sessionToken;
      const token2 = session2.body.data.sessionToken;

      // Both tokens should be different (due to different timestamps)
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
});