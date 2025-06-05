import { cacheService } from './cache-service';
import { database } from '@/database';
import { conversations } from '@/database/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { Conversation } from '@/types';
import { log } from '@/utils/logger';

export class ConversationCacheService {
  private activeTTL = 300; // 5 minutes for active conversations
  private completedTTL = 86400; // 24 hours for completed conversations
  private listTTL = 600; // 10 minutes for lists
  
  async getConversation(id: string): Promise<Conversation | null> {
    const cacheKey = `conversation:${id}`;
    
    // Try cache first
    const cached = await cacheService.get<Conversation>(cacheKey);
    if (cached) return cached;
    
    // Load from database
    const result = await database.select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    
    const conversation = result[0] || null;
    
    if (conversation) {
      // Cache based on status
      const ttl = conversation.status === 'completed' 
        ? this.completedTTL 
        : this.activeTTL;
        
      await cacheService.set(cacheKey, conversation, { 
        ttl,
        tags: [`user:${conversation.userId}`, `conversation:${id}`]
      });
    }
    
    return conversation;
  }
  
  async getUserConversations(
    userId: string, 
    limit = 20,
    offset = 0
  ): Promise<Conversation[]> {
    const cacheKey = `user-conversations:${userId}:${limit}:${offset}`;
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        const results = await database.select()
          .from(conversations)
          .where(eq(conversations.userId, userId))
          .orderBy(desc(conversations.createdAt))
          .limit(limit)
          .offset(offset);
          
        return results;
      },
      { ttl: this.listTTL, tags: [`user:${userId}`] }
    );
  }
  
  async getRecentConversations(
    userId: string,
    days = 7
  ): Promise<Conversation[]> {
    const cacheKey = `recent-conversations:${userId}:${days}`;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        const results = await database.select()
          .from(conversations)
          .where(
            and(
              eq(conversations.userId, userId),
              eq(conversations.status, 'completed')
            )
          )
          .orderBy(desc(conversations.createdAt));
          
        return results.filter(c => c.createdAt > since);
      },
      { ttl: this.listTTL, tags: [`user:${userId}`] }
    );
  }
  
  async updateConversation(
    id: string, 
    data: Partial<Conversation>
  ): Promise<void> {
    // Update in database
    await database.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id));
    
    // Get conversation to find userId
    const conversation = await this.getConversation(id);
    
    // Invalidate caches
    await cacheService.invalidate(`conversation:${id}`);
    
    if (conversation) {
      await this.invalidateUserConversations(conversation.userId);
    }
    
    log.info('Conversation cache invalidated', { conversationId: id });
  }
  
  async invalidateUserConversations(userId: string): Promise<void> {
    await cacheService.invalidate(`user-conversations:${userId}:*`);
    await cacheService.invalidate(`recent-conversations:${userId}:*`);
    await cacheService.invalidateByTag(`user:${userId}`);
  }
  
  async cacheConversationAnalysis(
    conversationId: string,
    analysis: any
  ): Promise<void> {
    const cacheKey = `conversation-analysis:${conversationId}`;
    
    // Cache analysis indefinitely (it doesn't change)
    await cacheService.set(cacheKey, analysis, {
      ttl: Infinity,
      compress: true,
      tags: [`conversation:${conversationId}`]
    });
  }
  
  async getConversationAnalysis(
    conversationId: string
  ): Promise<any | null> {
    const cacheKey = `conversation-analysis:${conversationId}`;
    return await cacheService.get(cacheKey);
  }
  
  async warmConversationCache(userId: string): Promise<void> {
    // Pre-load user's recent conversations
    const conversations = await this.getUserConversations(userId, 10);
    
    // Pre-load each conversation's details
    for (const conv of conversations) {
      await this.getConversation(conv.id);
      
      // Also try to load analysis if completed
      if (conv.status === 'completed') {
        await this.getConversationAnalysis(conv.id);
      }
    }
    
    log.info('Conversation cache warmed', { 
      userId, 
      conversationCount: conversations.length 
    });
  }
}

export const conversationCacheService = new ConversationCacheService();