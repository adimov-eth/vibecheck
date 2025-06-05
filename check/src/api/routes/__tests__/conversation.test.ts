import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { TestDatabase } from '@/test/utils/database';
import { AuthTestUtils } from '@/test/utils/auth-test-utils';
import { UserFactory, ConversationFactory } from '@/test/factories';
import { mockOpenAI } from '@/test/mocks/openai.mock';
import { mockNotificationService } from '@/test/mocks/notification.mock';
import conversationRouter from '../conversation';
import { handleError } from '@/middleware/error';
import * as usageService from '@/services/usage-service';
import * as conversationService from '@/services/conversation-service';
import { gptQueue } from '@/queues';
import type { User, Conversation } from '@/types';

// Mock external dependencies
mock.module('@/queues', () => ({
  gptQueue: {
    add: mock(async (jobName: string, data: any) => ({
      id: 'mock-job-id',
      name: jobName,
      data
    }))
  }
}));

mock.module('@/services/usage-service', () => ({
  canCreateConversation: mock(async (userId: string) => ({
    canCreate: true,
    reason: null
  }))
}));

// Create test app with conversation routes
const createTestApp = (): Application => {
  const app = express();
  
  app.use(express.json());
  app.use('/api/conversations', conversationRouter);
  app.use(handleError);
  
  return app;
};

describe('Conversation API Routes', () => {
  let app: Application;
  let testDb: TestDatabase;
  let testUser: User;
  let authToken: string;
  
  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
    app = createTestApp();
    
    // Mock external services
    (global as any).openAI = mockOpenAI;
    (global as any).notificationService = mockNotificationService;
  });
  
  beforeEach(async () => {
    await testDb.clean();
    
    // Create authenticated user
    const authResult = await AuthTestUtils.createAuthenticatedUser();
    testUser = authResult.user;
    authToken = authResult.token;
    
    // Reset mocks
    mockOpenAI.reset();
    mockNotificationService.reset();
    (gptQueue.add as any).mockReset();
    (usageService.canCreateConversation as any).mockReset();
    (usageService.canCreateConversation as any).mockResolvedValue({
      canCreate: true,
      reason: null
    });
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  describe('POST /api/conversations', () => {
    it('should create a new conversation', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'therapy',
          recordingType: 'separate'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        conversation: {
          id: expect.any(String),
          mode: 'therapy',
          recordingType: 'separate',
          status: 'created'
        }
      });
      
      // Verify saved to database
      const conversations = await conversationService.getUserConversations(testUser.id);
      expect(conversations).toHaveLength(1);
      expect(conversations[0].mode).toBe('therapy');
    });
    
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing mode and recordingType
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid request'),
        status: 400
      });
    });
    
    it('should validate recording type', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'therapy',
          recordingType: 'invalid'
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid request'),
        status: 400
      });
    });
    
    it('should enforce usage limits', async () => {
      (usageService.canCreateConversation as any).mockResolvedValue({
        canCreate: false,
        reason: 'Daily limit reached'
      });
      
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'therapy',
          recordingType: 'separate'
        });
      
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Usage limit reached',
        reason: 'Daily limit reached',
        status: 403
      });
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .send({
          mode: 'therapy',
          recordingType: 'separate'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Authentication required'
      });
    });
    
    it('should handle invalid auth token', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          mode: 'therapy',
          recordingType: 'separate'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('authentication')
      });
    });
  });
  
  describe('GET /api/conversations/:id', () => {
    let conversation: Conversation;
    
    beforeEach(async () => {
      conversation = await ConversationFactory.create({
        userId: testUser.id,
        mode: 'therapy',
        status: 'completed'
      });
    });
    
    it('should get conversation by id', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        conversation: {
          id: conversation.id,
          userId: testUser.id,
          mode: 'therapy',
          status: 'completed'
        }
      });
    });
    
    it('should enforce ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      
      const response = await request(app)
        .get(`/api/conversations/${otherConversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Access denied to this Conversation'
      });
    });
    
    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/conversations/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Conversation not found'
      });
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversation.id}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/conversations', () => {
    beforeEach(async () => {
      // Create test conversations
      await ConversationFactory.createMany(3, {
        userId: testUser.id,
        status: 'completed'
      });
      
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'processing'
      });
      
      // Create conversation for another user
      const otherUser = await UserFactory.create();
      await ConversationFactory.create({
        userId: otherUser.id
      });
    });
    
    it('should get all user conversations', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.conversations).toHaveLength(4);
      expect(response.body.conversations.every((c: any) => c.userId === testUser.id)).toBe(true);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/conversations');
      
      expect(response.status).toBe(401);
    });
    
    it('should handle empty conversation list', async () => {
      // Create new user with no conversations
      const newUser = await UserFactory.create();
      const { token } = await AuthTestUtils.createAuthToken(newUser.id);
      
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.conversations).toEqual([]);
    });
  });
  
  describe('POST /api/conversations/:id/process', () => {
    let conversation: Conversation;
    
    beforeEach(async () => {
      conversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'waiting'
      });
    });
    
    it('should process a conversation', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversation.id}/process`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        message: 'Processing started',
        conversationId: conversation.id
      });
      
      // Verify queue job was created
      expect(gptQueue.add).toHaveBeenCalledWith('process-conversation', {
        conversationId: conversation.id,
        userId: testUser.id
      });
      
      // Verify status was updated
      const updated = await conversationService.getConversationById(conversation.id);
      expect(updated?.status).toBe('processing');
    });
    
    it('should prevent processing already processing conversation', async () => {
      const processingConversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'processing'
      });
      
      const response = await request(app)
        .post(`/api/conversations/${processingConversation.id}/process`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Conversation is already being processed'
      });
    });
    
    it('should enforce ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      
      const response = await request(app)
        .post(`/api/conversations/${otherConversation.id}/process`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(403);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversation.id}/process`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Rate Limiting', () => {
    it('should rate limit conversation creation', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill(null).map(() => 
        request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            mode: 'therapy',
            recordingType: 'separate'
          })
      );
      
      const responses = await Promise.all(requests);
      
      // Some should succeed, others should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
      
      const limited = rateLimited[0];
      expect(limited.body).toMatchObject({
        error: expect.stringContaining('rate limit')
      });
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      const originalCreate = conversationService.createConversation;
      (conversationService as any).createConversation = mock(() => {
        throw new Error('Database connection failed');
      });
      
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mode: 'therapy',
          recordingType: 'separate'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Internal server error',
        status: 500
      });
      
      // Restore original function
      (conversationService as any).createConversation = originalCreate;
    });
    
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json');
      
      expect(response.status).toBe(400);
    });
  });
});