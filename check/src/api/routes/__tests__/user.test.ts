import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { TestDatabase } from '@/test/utils/database';
import { AuthTestUtils } from '@/test/utils/auth-test-utils';
import { UserFactory, SubscriptionFactory } from '@/test/factories';
import userRouter from '../user';
import { handleError } from '@/middleware/error';
import * as appleAuth from '@/utils/apple-auth';
import * as sessionService from '@/services/session-service';
import * as userService from '@/services/user-service';
import * as usageService from '@/services/usage-service';
import { AccountLockoutService } from '@/services/account-lockout-service';
import type { User } from '@/types';

// Mock dependencies
mock.module('@/utils/apple-auth', () => ({
  verifyAppleToken: mock(async (token: string) => {
    if (token === 'valid-apple-token') {
      return {
        success: true,
        data: {
          sub: 'apple-user-123',
          email: 'test@example.com'
        }
      };
    }
    if (token === 'new-user-token') {
      return {
        success: true,
        data: {
          sub: 'new-apple-user',
          email: 'newuser@example.com'
        }
      };
    }
    return {
      success: false,
      error: new Error('Invalid token')
    };
  })
}));

// Create test app
const createTestApp = (): Application => {
  const app = express();
  
  app.use(express.json());
  app.use('/api/user', userRouter);
  app.use(handleError);
  
  return app;
};

describe('User API Routes', () => {
  let app: Application;
  let testDb: TestDatabase;
  let testUser: User;
  let authToken: string;
  
  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
    app = createTestApp();
    
    // Disable rate limiting for tests
    process.env.RATE_LIMITING_ENABLED = 'false';
  });
  
  beforeEach(async () => {
    await testDb.clean();
    
    // Create authenticated user
    const authResult = await AuthTestUtils.createAuthenticatedUser();
    testUser = authResult.user;
    authToken = authResult.token;
    
    // Reset mocks
    (appleAuth.verifyAppleToken as any).mockReset();
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  describe('GET /api/user/me', () => {
    it('should get current user data with usage stats', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        usage: {
          currentUsage: expect.any(Number),
          limit: expect.any(Number),
          isSubscribed: false,
          remainingConversations: expect.any(Number),
          resetDate: expect.any(String)
        }
      });
    });
    
    it('should include subscription status', async () => {
      // Create active subscription
      await SubscriptionFactory.createActive(testUser.id);
      
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.usage.isSubscribed).toBe(true);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user/me');
      
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Authentication required'
      });
    });
    
    it('should handle invalid token', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
    });
    
    it('should create minimal user record if missing', async () => {
      // Create auth token for non-existent user
      const missingUserId = 'missing-user-id';
      const { token } = await AuthTestUtils.createAuthToken(missingUserId, {
        email: 'missing@example.com',
        fullName: {
          givenName: 'Missing',
          familyName: 'User'
        }
      });
      
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: missingUserId,
        email: 'missing@example.com',
        name: 'Missing User'
      });
      
      // Verify user was created
      const createdUser = await userService.getUser(missingUserId);
      expect(createdUser).toBeTruthy();
    });
  });
  
  describe('POST /api/user/apple-auth', () => {
    it('should authenticate with Apple and create session', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'test@example.com',
          fullName: {
            givenName: 'Test',
            familyName: 'User'
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: {
            id: expect.any(String),
            email: 'test@example.com',
            name: expect.any(String)
          },
          sessionToken: expect.any(String)
        }
      });
      
      // Verify token is valid
      const tokenResult = await sessionService.verifySessionToken(response.body.data.sessionToken);
      expect(tokenResult.success).toBe(true);
    });
    
    it('should create new user on first sign in', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'new-user-token',
          email: 'newuser@example.com',
          fullName: {
            givenName: 'New',
            familyName: 'User'
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe('newuser@example.com');
      expect(response.body.data.user.name).toBe('New User');
      
      // Verify user was created
      const users = await userService.getUserByEmail('newuser@example.com');
      expect(users).toBeTruthy();
    });
    
    it('should handle invalid identity token', async () => {
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'invalid-token',
          email: 'test@example.com'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid token'
      });
    });
    
    it('should require identity token', async () => {
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
    
    it('should format full name correctly', async () => {
      const testCases = [
        { input: { givenName: 'John', familyName: 'Doe' }, expected: 'John Doe' },
        { input: { givenName: 'John', familyName: '' }, expected: 'John' },
        { input: { givenName: '', familyName: 'Doe' }, expected: 'Doe' },
        { input: { givenName: ' John ', familyName: ' Doe ' }, expected: 'John Doe' },
      ];
      
      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/user/apple-auth')
          .send({
            identityToken: 'valid-apple-token',
            email: `test-${Date.now()}@example.com`,
            fullName: testCase.input
          });
        
        expect(response.status).toBe(200);
        expect(response.body.data.user.name).toBe(testCase.expected);
      }
    });
    
    it('should handle account lockout', async () => {
      // Enable rate limiting for this test
      process.env.RATE_LIMITING_ENABLED = 'true';
      
      // Mock account locked
      const isLockedSpy = mock(() => Promise.resolve(true));
      (AccountLockoutService as any).isAccountLocked = isLockedSpy;
      
      const response = await request(app)
        .post('/api/user/apple-auth')
        .send({
          identityToken: 'valid-apple-token',
          email: 'locked@example.com'
        });
      
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Account is locked'),
        code: 'ACCOUNT_LOCKED'
      });
      
      // Restore
      process.env.RATE_LIMITING_ENABLED = 'false';
    });
  });
  
  describe('GET /api/user/usage', () => {
    it('should get user usage statistics', async () => {
      const response = await request(app)
        .get('/api/user/usage')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        usage: {
          currentUsage: expect.any(Number),
          limit: expect.any(Number),
          isSubscribed: false,
          remainingConversations: expect.any(Number),
          resetDate: expect.any(String)
        }
      });
    });
    
    it('should reflect subscription status', async () => {
      await SubscriptionFactory.createActive(testUser.id);
      
      const response = await request(app)
        .get('/api/user/usage')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.usage.isSubscribed).toBe(true);
      expect(response.body.usage.limit).toBeGreaterThan(10); // Premium limit
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user/usage');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Mock service error
      const originalGetUser = userService.getUser;
      (userService as any).getUser = mock(() => {
        throw new Error('Database connection failed');
      });
      
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Internal server error'
      });
      
      // Restore
      (userService as any).getUser = originalGetUser;
    });
  });
  
  describe('Cache Headers', () => {
    it('should cache user data appropriately', async () => {
      const response = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers['cache-control']).toContain('max-age=300');
    });
    
    it('should cache usage stats for shorter duration', async () => {
      const response = await request(app)
        .get('/api/user/usage')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.headers['cache-control']).toContain('max-age=60');
    });
  });
});