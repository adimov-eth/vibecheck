import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { TestDatabase } from '@/test/utils/database';
import { AuthTestUtils } from '@/test/utils/auth-test-utils';
import { UserFactory, SubscriptionFactory } from '@/test/factories';
import subscriptionRouter from '../subscription';
import { handleError } from '@/middleware/error';
import * as subscriptionService from '@/services/subscription-serivice';
import * as appleJwsVerifier from '@/services/apple-jws-verifier';
import type { User } from '@/types';

// Mock dependencies
mock.module('@/services/apple-jws-verifier', () => ({
  verifyAppleSignedData: mock(async (signedData: string) => {
    if (signedData === 'valid-signed-data') {
      return {
        isValid: true,
        payload: {
          transactionId: 'txn_123',
          originalTransactionId: 'orig_txn_123',
          productId: 'com.vibecheck.monthly',
          purchaseDate: Date.now(),
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
          environment: 'Production'
        }
      };
    }
    if (signedData === 'expired-signed-data') {
      return {
        isValid: true,
        payload: {
          transactionId: 'txn_expired',
          originalTransactionId: 'orig_txn_expired',
          productId: 'com.vibecheck.monthly',
          purchaseDate: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
          expiresDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
          environment: 'Production'
        }
      };
    }
    return {
      isValid: false,
      error: 'Invalid signature'
    };
  })
}));

// Create test app
const createTestApp = (): Application => {
  const app = express();
  
  app.use(express.json());
  app.use('/api/subscription', subscriptionRouter);
  app.use(handleError);
  
  return app;
};

describe('Subscription API Routes', () => {
  let app: Application;
  let testDb: TestDatabase;
  let testUser: User;
  let authToken: string;
  
  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
    app = createTestApp();
  });
  
  beforeEach(async () => {
    await testDb.clean();
    
    // Create authenticated user
    const authResult = await AuthTestUtils.createAuthenticatedUser();
    testUser = authResult.user;
    authToken = authResult.token;
    
    // Reset mocks
    (appleJwsVerifier.verifyAppleSignedData as any).mockReset();
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  describe('GET /api/subscription/status', () => {
    it('should get subscription status for user without subscription', async () => {
      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        subscription: {
          isActive: false,
          expiresDate: null,
          type: null,
          subscriptionId: null
        }
      });
    });
    
    it('should get active subscription status', async () => {
      const subscription = await SubscriptionFactory.createActive(testUser.id);
      
      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        subscription: {
          isActive: true,
          expiresDate: expect.any(Number),
          type: subscription.plan,
          subscriptionId: subscription.originalTransactionId
        }
      });
      
      // Verify expires date is in the future
      expect(response.body.subscription.expiresDate).toBeGreaterThan(Date.now());
    });
    
    it('should get expired subscription status', async () => {
      await SubscriptionFactory.createExpired(testUser.id);
      
      const response = await request(app)
        .get('/api/subscription/status')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        subscription: {
          isActive: false,
          expiresDate: expect.any(Number),
          type: null,
          subscriptionId: null
        }
      });
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/subscription/status');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('POST /api/subscription/verify', () => {
    it('should verify and save valid subscription', async () => {
      const response = await request(app)
        .post('/api/subscription/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receiptData: 'valid-signed-data'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Subscription verified successfully.',
        subscription: {
          isActive: true,
          expiresDate: expect.any(Number),
          type: expect.stringContaining('monthly'),
          subscriptionId: 'orig_txn_123'
        }
      });
      
      // Verify subscription was saved
      const userSub = await subscriptionService.hasActiveSubscription(testUser.id);
      expect(userSub.isActive).toBe(true);
    });
    
    it('should handle expired subscription verification', async () => {
      const response = await request(app)
        .post('/api/subscription/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receiptData: 'expired-signed-data'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.subscription.isActive).toBe(false);
    });
    
    it('should validate receipt data format', async () => {
      const response = await request(app)
        .post('/api/subscription/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing receiptData
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid request format')
      });
    });
    
    it('should handle invalid signed data', async () => {
      const response = await request(app)
        .post('/api/subscription/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receiptData: 'invalid-signed-data'
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Signed data verification failed')
      });
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/subscription/verify')
        .send({
          receiptData: 'valid-signed-data'
        });
      
      expect(response.status).toBe(401);
    });
    
    it('should handle save failures', async () => {
      // Mock save failure
      const originalSave = subscriptionService.verifyAndSaveSubscription;
      (subscriptionService as any).verifyAndSaveSubscription = mock(async () => ({
        success: false,
        error: new Error('Database error')
      }));
      
      const response = await request(app)
        .post('/api/subscription/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receiptData: 'valid-signed-data'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Failed to process subscription verification.'
      });
      
      // Restore
      (subscriptionService as any).verifyAndSaveSubscription = originalSave;
    });
  });
  
  describe('POST /api/subscription/notifications', () => {
    it('should process App Store server notification', async () => {
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          signedPayload: 'valid-signed-data',
          notificationType: 'DID_RENEW',
          notificationUUID: 'uuid-123',
          version: '2.0'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true
      });
    });
    
    it('should handle notification with signed transaction info', async () => {
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          notificationType: 'DID_RENEW',
          data: {
            signedTransactionInfo: 'valid-signed-data',
            environment: 'Production'
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
    
    it('should handle notification without signed data', async () => {
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          notificationType: 'TEST_NOTIFICATION',
          notificationUUID: 'uuid-123'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Notification received but no signed data found to process.'
      });
    });
    
    it('should validate notification format', async () => {
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          invalidField: 'test'
        });
      
      // The schema is very permissive, so this should still pass
      expect(response.status).toBe(200);
    });
    
    it('should handle verification failures', async () => {
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          signedPayload: 'invalid-signed-data'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Signed data verification failed')
      });
    });
    
    it('should handle update failures', async () => {
      // Mock update failure
      const originalUpdate = subscriptionService.updateSubscriptionFromNotification;
      (subscriptionService as any).updateSubscriptionFromNotification = mock(async () => ({
        success: false,
        error: new Error('Update failed')
      }));
      
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          signedPayload: 'valid-signed-data'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Failed to process notification')
      });
      
      // Restore
      (subscriptionService as any).updateSubscriptionFromNotification = originalUpdate;
    });
    
    it('should NOT require authentication', async () => {
      // App Store notifications come without auth
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          signedPayload: 'valid-signed-data'
        });
      
      expect(response.status).toBe(200);
    });
  });
  
  describe('Middleware Behavior', () => {
    it('should bypass auth for notifications endpoint', async () => {
      // Should work without auth token
      const response = await request(app)
        .post('/api/subscription/notifications')
        .send({
          notificationType: 'TEST'
        });
      
      expect(response.status).not.toBe(401);
    });
    
    it('should require auth for other endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/subscription/status' },
        { method: 'post', path: '/api/subscription/verify' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .send({ receiptData: 'test' });
        
        expect(response.status).toBe(401);
      }
    });
  });
});