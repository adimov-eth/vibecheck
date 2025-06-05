import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test';
import express, { Application } from 'express';
import request from 'supertest';
import { TestDatabase } from '@/test/utils/database';
import { AuthTestUtils } from '@/test/utils/auth-test-utils';
import { UserFactory, ConversationFactory, AudioFactory } from '@/test/factories';
import { mockStorageService } from '@/test/mocks/storage.mock';
import audioRouter from '../audio';
import { handleError } from '@/middleware/error';
import * as audioService from '@/services/audio-service';
import { audioQueue } from '@/queues';
import type { User, Conversation, Audio } from '@/types';

// Mock dependencies
mock.module('@/queues', () => ({
  audioQueue: {
    add: mock(async (jobName: string, data: any, options: any) => ({
      id: 'mock-audio-job-id',
      name: jobName,
      data,
      options
    }))
  }
}));

mock.module('@/utils/file', () => ({
  saveFile: mock(async (buffer: Buffer, fileName: string) => {
    mockStorageService.addMockFile(`uploads/${fileName}`, buffer);
    return `uploads/${fileName}`;
  })
}));

// Create test app
const createTestApp = (): Application => {
  const app = express();
  
  app.use(express.json());
  app.use('/api/audio', audioRouter);
  app.use(handleError);
  
  return app;
};

describe('Audio API Routes', () => {
  let app: Application;
  let testDb: TestDatabase;
  let testUser: User;
  let authToken: string;
  let testConversation: Conversation;
  
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
    
    // Create test conversation
    testConversation = await ConversationFactory.create({
      userId: testUser.id,
      mode: 'therapy',
      status: 'waiting'
    });
    
    // Reset mocks
    mockStorageService.reset();
    (audioQueue.add as any).mockReset();
  });
  
  afterAll(async () => {
    await testDb.destroy();
  });
  
  describe('POST /api/audio/upload', () => {
    const createTestAudioBuffer = () => {
      return Buffer.from('test-audio-data');
    };
    
    it('should upload audio file successfully', async () => {
      const audioBuffer = createTestAudioBuffer();
      
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('conversationId', testConversation.id)
        .field('audioKey', 'client')
        .attach('audio', audioBuffer, 'test-audio.m4a');
      
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Audio uploaded and queued for processing.',
        audioId: expect.any(String),
        url: expect.stringContaining('uploads/')
      });
      
      // Verify audio record was created
      const audio = await audioService.getAudioById(response.body.audioId);
      expect(audio).toMatchObject({
        conversationId: testConversation.id,
        userId: testUser.id,
        audioKey: 'client',
        status: 'uploaded'
      });
      
      // Verify job was queued
      expect(audioQueue.add).toHaveBeenCalledWith(
        'process-audio',
        expect.objectContaining({
          audioId: response.body.audioId,
          conversationId: testConversation.id,
          audioPath: response.body.url,
          userId: testUser.id,
          audioKey: 'client'
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }
        })
      );
    });
    
    it('should validate audio format', async () => {
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('conversationId', testConversation.id)
        .field('audioKey', 'client')
        .attach('audio', Buffer.from('test'), 'test.txt');
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Unsupported audio format')
      });
    });
    
    it('should enforce file size limit', async () => {
      // Create 11MB buffer (exceeds 10MB limit)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('conversationId', testConversation.id)
        .field('audioKey', 'client')
        .attach('audio', largeBuffer, 'large-audio.m4a');
      
      expect(response.status).toBe(400);
    });
    
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', createTestAudioBuffer(), 'test.m4a');
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Conversation ID is required')
      });
    });
    
    it('should check conversation ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('conversationId', otherConversation.id)
        .field('audioKey', 'client')
        .attach('audio', createTestAudioBuffer(), 'test.m4a');
      
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'User does not own conversation'
      });
    });
    
    it('should enforce audio upload constraints', async () => {
      // Mock constraint violation
      const originalCheck = audioService.checkAudioUploadConstraints;
      (audioService as any).checkAudioUploadConstraints = mock(async () => {
        throw new Error('Maximum audio files reached for this conversation');
      });
      
      const response = await request(app)
        .post('/api/audio/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('conversationId', testConversation.id)
        .field('audioKey', 'client')
        .attach('audio', createTestAudioBuffer(), 'test.m4a');
      
      expect(response.status).toBe(500);
      
      // Restore
      (audioService as any).checkAudioUploadConstraints = originalCheck;
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/audio/upload')
        .field('conversationId', testConversation.id)
        .field('audioKey', 'client')
        .attach('audio', createTestAudioBuffer(), 'test.m4a');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/audio/:id', () => {
    let testAudio: Audio;
    
    beforeEach(async () => {
      testAudio = await AudioFactory.create({
        conversationId: testConversation.id,
        userId: testUser.id,
        audioKey: 'client'
      });
    });
    
    it('should get audio by id', async () => {
      const response = await request(app)
        .get(`/api/audio/${testAudio.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        audio: {
          id: testAudio.id,
          conversationId: testConversation.id,
          userId: testUser.id,
          audioKey: 'client',
          status: testAudio.status
        }
      });
    });
    
    it('should enforce ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      const otherAudio = await AudioFactory.create({
        conversationId: otherConversation.id,
        userId: otherUser.id
      });
      
      const response = await request(app)
        .get(`/api/audio/${otherAudio.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(403);
    });
    
    it('should return 404 for non-existent audio', async () => {
      const response = await request(app)
        .get('/api/audio/999999')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/audio/${testAudio.id}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/audio/conversation/:conversationId', () => {
    beforeEach(async () => {
      // Create multiple audio files for the conversation
      await AudioFactory.createMany(3, {
        conversationId: testConversation.id,
        userId: testUser.id
      });
      
      // Create audio for another conversation
      const otherConversation = await ConversationFactory.create({
        userId: testUser.id
      });
      await AudioFactory.create({
        conversationId: otherConversation.id,
        userId: testUser.id
      });
    });
    
    it('should get all audios for a conversation', async () => {
      const response = await request(app)
        .get(`/api/audio/conversation/${testConversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.audios).toHaveLength(3);
      expect(response.body.audios.every((a: any) => 
        a.conversationId === testConversation.id
      )).toBe(true);
    });
    
    it('should enforce conversation ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      
      const response = await request(app)
        .get(`/api/audio/conversation/${otherConversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(403);
    });
    
    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/audio/conversation/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(404);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/audio/conversation/${testConversation.id}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('PATCH /api/audio/:id/status', () => {
    let testAudio: Audio;
    
    beforeEach(async () => {
      testAudio = await AudioFactory.create({
        conversationId: testConversation.id,
        userId: testUser.id,
        status: 'uploaded'
      });
    });
    
    it('should update audio status', async () => {
      const response = await request(app)
        .patch(`/api/audio/${testAudio.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'transcribed'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true
      });
      
      // Verify status was updated
      const updated = await audioService.getAudioById(testAudio.id);
      expect(updated?.status).toBe('transcribed');
    });
    
    it('should validate status values', async () => {
      const response = await request(app)
        .patch(`/api/audio/${testAudio.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'invalid-status'
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Invalid status')
      });
    });
    
    it('should enforce ownership', async () => {
      const otherUser = await UserFactory.create();
      const otherConversation = await ConversationFactory.create({
        userId: otherUser.id
      });
      const otherAudio = await AudioFactory.create({
        conversationId: otherConversation.id,
        userId: otherUser.id
      });
      
      const response = await request(app)
        .patch(`/api/audio/${otherAudio.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'transcribed'
        });
      
      expect(response.status).toBe(403);
    });
    
    it('should require authentication', async () => {
      const response = await request(app)
        .patch(`/api/audio/${testAudio.id}/status`)
        .send({
          status: 'transcribed'
        });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Rate Limiting', () => {
    it('should rate limit audio uploads', async () => {
      // Make multiple rapid upload requests
      const requests = Array(5).fill(null).map(() => 
        request(app)
          .post('/api/audio/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .field('conversationId', testConversation.id)
          .field('audioKey', 'client')
          .attach('audio', createTestAudioBuffer(), 'test.m4a')
      );
      
      const responses = await Promise.all(requests);
      
      // Some should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});