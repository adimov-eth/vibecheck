import { describe, it, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test';
import { ConversationService } from '../conversation-service';
import { TestDatabase } from '@/test/utils/database';
import { UserFactory, ConversationFactory, AudioFactory } from '@/test/factories';
import { mockOpenAI } from '@/test/mocks/openai.mock';
import { mockNotificationService } from '@/test/mocks/notification.mock';
import type { User, Conversation } from '@/types';

describe('ConversationService', () => {
  let conversationService: ConversationService;
  let testDb: TestDatabase;
  let testUser: User;
  
  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
    conversationService = new ConversationService();
    
    // Mock external services
    (global as any).openAI = mockOpenAI;
    (global as any).notificationService = mockNotificationService;
  });
  
  beforeEach(async () => {
    await testDb.clean();
    testUser = await UserFactory.create();
    mockOpenAI.reset();
    mockNotificationService.reset();
  });
  
  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const conversationData = {
        userId: testUser.id,
        mode: 'therapy' as const,
        recordingType: 'separate' as const
      };
      
      const conversation = await conversationService.create(conversationData);
      
      expect(conversation).toMatchObject({
        id: expect.any(String),
        userId: testUser.id,
        mode: 'therapy',
        recordingType: 'separate',
        status: 'waiting',
        duration: 0
      });
      
      // Verify it was saved to database
      const saved = await conversationService.getById(conversation.id);
      expect(saved).toEqual(conversation);
    });
    
    it('should validate user exists', async () => {
      const conversationData = {
        userId: 'non-existent-user',
        mode: 'therapy' as const,
        recordingType: 'separate' as const
      };
      
      await expect(
        conversationService.create(conversationData)
      ).rejects.toThrow('User not found');
    });
    
    it('should validate mode', async () => {
      const conversationData = {
        userId: testUser.id,
        mode: 'invalid-mode' as any,
        recordingType: 'separate' as const
      };
      
      await expect(
        conversationService.create(conversationData)
      ).rejects.toThrow('Invalid mode');
    });
    
    it('should enforce usage limits', async () => {
      // Create max conversations for the day
      const maxDaily = 10; // Assuming this is the limit
      for (let i = 0; i < maxDaily; i++) {
        await ConversationFactory.create({ 
          userId: testUser.id,
          createdAt: new Date() // Today
        });
      }
      
      // Try to create one more
      await expect(
        conversationService.create({
          userId: testUser.id,
          mode: 'therapy',
          recordingType: 'separate'
        })
      ).rejects.toThrow('Daily conversation limit reached');
    });
  });
  
  describe('processConversation', () => {
    let conversation: Conversation;
    let audios: any[];
    
    beforeEach(async () => {
      const result = await ConversationFactory.createWithAudios({
        userId: testUser.id,
        status: 'processing'
      }, 2);
      conversation = result.conversation;
      audios = result.audios;
    });
    
    it('should process conversation with transcription and analysis', async () => {
      await conversationService.processConversation(conversation.id);
      
      // Verify OpenAI was called
      expect(mockOpenAI.transcribeAudio).toHaveBeenCalledTimes(audios.length);
      expect(mockOpenAI.analyzeConversation).toHaveBeenCalledTimes(1);
      
      // Verify conversation was updated
      const updated = await conversationService.getById(conversation.id);
      expect(updated.status).toBe('completed');
      expect(updated.transcript).toBeTruthy();
      expect(updated.analysis).toBeTruthy();
      expect(updated.analysis.summary).toBeTruthy();
      expect(updated.analysis.sentiment).toBe('positive');
    });
    
    it('should handle transcription errors', async () => {
      mockOpenAI.simulateError('transcribe');
      
      await conversationService.processConversation(conversation.id);
      
      const updated = await conversationService.getById(conversation.id);
      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toContain('Rate limit exceeded');
    });
    
    it('should send notification on completion', async () => {
      await conversationService.processConversation(conversation.id);
      
      expect(mockNotificationService.sendPushNotification).toHaveBeenCalledWith(
        testUser.id,
        expect.objectContaining({
          title: expect.stringContaining('ready'),
          body: expect.any(String)
        })
      );
    });
    
    it('should handle empty audio list', async () => {
      const emptyConversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'processing'
      });
      
      await expect(
        conversationService.processConversation(emptyConversation.id)
      ).rejects.toThrow('No audio files to process');
    });
  });
  
  describe('getUserConversations', () => {
    beforeEach(async () => {
      // Create various conversations
      await ConversationFactory.createMany(3, {
        userId: testUser.id,
        status: 'completed'
      });
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'processing'
      });
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'failed'
      });
      
      // Create conversation for another user
      const otherUser = await UserFactory.create();
      await ConversationFactory.create({
        userId: otherUser.id
      });
    });
    
    it('should return all user conversations', async () => {
      const conversations = await conversationService.getUserConversations(testUser.id);
      
      expect(conversations).toHaveLength(5);
      expect(conversations.every(c => c.userId === testUser.id)).toBe(true);
    });
    
    it('should filter by status', async () => {
      const completed = await conversationService.getUserConversations(
        testUser.id,
        { status: 'completed' }
      );
      
      expect(completed).toHaveLength(3);
      expect(completed.every(c => c.status === 'completed')).toBe(true);
    });
    
    it('should paginate results', async () => {
      const page1 = await conversationService.getUserConversations(
        testUser.id,
        { limit: 2, offset: 0 }
      );
      
      const page2 = await conversationService.getUserConversations(
        testUser.id,
        { limit: 2, offset: 2 }
      );
      
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
    
    it('should order by creation date desc', async () => {
      const conversations = await conversationService.getUserConversations(testUser.id);
      
      for (let i = 1; i < conversations.length; i++) {
        expect(conversations[i - 1].createdAt.getTime())
          .toBeGreaterThanOrEqual(conversations[i].createdAt.getTime());
      }
    });
  });
  
  describe('updateConversation', () => {
    let conversation: Conversation;
    
    beforeEach(async () => {
      conversation = await ConversationFactory.create({
        userId: testUser.id,
        status: 'waiting'
      });
    });
    
    it('should update conversation fields', async () => {
      const updates = {
        status: 'completed' as const,
        transcript: 'Updated transcript',
        analysis: {
          summary: 'Updated analysis',
          sentiment: 'positive'
        }
      };
      
      await conversationService.update(conversation.id, updates);
      
      const updated = await conversationService.getById(conversation.id);
      expect(updated.status).toBe('completed');
      expect(updated.transcript).toBe('Updated transcript');
      expect(updated.analysis.summary).toBe('Updated analysis');
    });
    
    it('should not update userId', async () => {
      const otherUser = await UserFactory.create();
      
      await conversationService.update(conversation.id, {
        userId: otherUser.id
      } as any);
      
      const updated = await conversationService.getById(conversation.id);
      expect(updated.userId).toBe(testUser.id); // Should not change
    });
    
    it('should update updatedAt timestamp', async () => {
      const before = conversation.updatedAt;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await conversationService.update(conversation.id, {
        status: 'processing'
      });
      
      const updated = await conversationService.getById(conversation.id);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });
  });
  
  describe('deleteConversation', () => {
    it('should soft delete conversation', async () => {
      const conversation = await ConversationFactory.create({
        userId: testUser.id
      });
      
      await conversationService.delete(conversation.id);
      
      // Should not be returned in normal queries
      const conversations = await conversationService.getUserConversations(testUser.id);
      expect(conversations.find(c => c.id === conversation.id)).toBeUndefined();
      
      // But should still exist in database with deleted flag
      const deleted = await conversationService.getById(conversation.id, {
        includeDeleted: true
      });
      expect(deleted).toBeTruthy();
      expect(deleted.deletedAt).toBeTruthy();
    });
    
    it('should cascade delete related audios', async () => {
      const { conversation, audios } = await ConversationFactory.createWithAudios({
        userId: testUser.id
      });
      
      await conversationService.delete(conversation.id);
      
      // Verify audios are also marked as deleted
      for (const audio of audios) {
        const deletedAudio = await testDb.execute(
          'SELECT * FROM audios WHERE id = ?',
          [audio.id]
        );
        expect(deletedAudio[0].deleted_at).toBeTruthy();
      }
    });
  });
  
  describe('getConversationStats', () => {
    beforeEach(async () => {
      // Create conversations with different statuses and dates
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'completed',
        mode: 'therapy',
        duration: 1800,
        createdAt: now
      });
      
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'completed',
        mode: 'coaching',
        duration: 2400,
        createdAt: lastWeek
      });
      
      await ConversationFactory.create({
        userId: testUser.id,
        status: 'failed',
        mode: 'therapy',
        createdAt: lastMonth
      });
    });
    
    it('should calculate user statistics', async () => {
      const stats = await conversationService.getUserStats(testUser.id);
      
      expect(stats).toEqual({
        totalConversations: 3,
        completedConversations: 2,
        averageDuration: 2100, // (1800 + 2400) / 2
        totalDuration: 4200,
        modeBreakdown: {
          therapy: 2,
          coaching: 1
        },
        successRate: 0.67, // 2/3
        lastActivityDate: expect.any(Date)
      });
    });
    
    it('should filter by date range', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const stats = await conversationService.getUserStats(testUser.id, {
        startDate: twoWeeksAgo,
        endDate: now
      });
      
      expect(stats.totalConversations).toBe(2); // Excludes last month
    });
  });
});