import { database } from '@/database';
import { conversations, users, audios } from '@/database/schema';
import { eq, desc, and, sql, gte, lte } from 'drizzle-orm';
import type { LoaderContext } from '@/loaders';
import { log } from '@/utils/logger';

export interface ConversationWithDetails {
  id: string;
  userId: string;
  mode: string;
  recordingType: string;
  status: string;
  transcript?: string;
  analysis?: any;
  duration: number;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  userEmail: string;
  userName?: string;
  audioCount: number;
  totalDuration: number;
  lastAudioAt?: Date;
  audios: Array<{
    id: string;
    status: string;
    duration: number;
    createdAt: Date;
  }>;
}

export interface ConversationStats {
  totalConversations: number;
  completedConversations: number;
  activeDays: number;
  avgDuration: number;
  lastConversationAt?: Date;
  modeDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
}

export class OptimizedConversationService {
  /**
   * Get conversation with all details in a single optimized query
   */
  async getConversationWithDetails(
    conversationId: string
  ): Promise<ConversationWithDetails | null> {
    const result = await database
      .select({
        // Conversation fields
        id: conversations.id,
        userId: conversations.userId,
        mode: conversations.mode,
        recordingType: conversations.recordingType,
        status: conversations.status,
        transcript: conversations.transcript,
        analysis: conversations.analysis,
        duration: conversations.duration,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        // User fields
        userEmail: users.email,
        userName: users.name,
        // Aggregated audio data
        audioCount: sql<number>`count(distinct ${audios.id})`.as('audio_count'),
        totalDuration: sql<number>`coalesce(sum(${audios.duration}), 0)`.as('total_duration'),
        lastAudioAt: sql<Date>`max(${audios.createdAt})`.as('last_audio_at')
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .leftJoin(audios, eq(audios.conversationId, conversations.id))
      .where(eq(conversations.id, conversationId))
      .groupBy(
        conversations.id,
        users.email,
        users.name
      );
    
    if (result.length === 0) return null;
    
    // Get audio details separately to avoid cartesian product
    const audioDetails = await database
      .select({
        id: audios.id,
        status: audios.status,
        duration: audios.duration,
        createdAt: audios.createdAt
      })
      .from(audios)
      .where(eq(audios.conversationId, conversationId))
      .orderBy(audios.createdAt);
    
    return {
      ...result[0],
      audios: audioDetails
    } as ConversationWithDetails;
  }
  
  /**
   * Get user conversation statistics efficiently
   */
  async getUserConversationStats(
    userId: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<ConversationStats> {
    // Build where conditions
    const conditions = [eq(conversations.userId, userId)];
    if (dateRange?.start) {
      conditions.push(gte(conversations.createdAt, dateRange.start));
    }
    if (dateRange?.end) {
      conditions.push(lte(conversations.createdAt, dateRange.end));
    }
    
    // Get basic stats in one query
    const statsResult = await database
      .select({
        totalConversations: sql<number>`count(*)`.as('total'),
        completedConversations: sql<number>`count(case when ${conversations.status} = 'completed' then 1 end)`.as('completed'),
        activeDays: sql<number>`count(distinct date(${conversations.createdAt}))`.as('active_days'),
        avgDuration: sql<number>`avg(${conversations.duration})`.as('avg_duration'),
        lastConversationAt: sql<Date>`max(${conversations.createdAt})`.as('last_at')
      })
      .from(conversations)
      .where(and(...conditions));
    
    // Get mode distribution
    const modeResult = await database
      .select({
        mode: conversations.mode,
        count: sql<number>`count(*)`.as('count')
      })
      .from(conversations)
      .where(and(...conditions))
      .groupBy(conversations.mode);
    
    const modeDistribution = modeResult.reduce((acc, row) => {
      acc[row.mode] = row.count;
      return acc;
    }, {} as Record<string, number>);
    
    // Get sentiment distribution from analysis JSON
    const sentimentResult = await database
      .select({
        sentiment: sql<string>`${conversations.analysis}->>'sentiment'`.as('sentiment'),
        count: sql<number>`count(*)`.as('count')
      })
      .from(conversations)
      .where(and(
        ...conditions,
        sql`${conversations.analysis}->>'sentiment' is not null`
      ))
      .groupBy(sql`${conversations.analysis}->>'sentiment'`);
    
    const sentimentDistribution = sentimentResult.reduce((acc, row) => {
      if (row.sentiment) {
        acc[row.sentiment] = row.count;
      }
      return acc;
    }, {} as Record<string, number>);
    
    return {
      ...statsResult[0],
      modeDistribution,
      sentimentDistribution
    };
  }
  
  /**
   * Get recent conversations with user data - optimized for list view
   */
  async getRecentConversationsWithUsers(
    limit = 20,
    offset = 0
  ): Promise<Array<{
    conversation: any;
    user: { id: string; email: string; name?: string };
    audioCount: number;
  }>> {
    const results = await database
      .select({
        // Conversation data
        conversation: conversations,
        // User data
        userId: users.id,
        userEmail: users.email,
        userName: users.name,
        // Audio count
        audioCount: sql<number>`count(distinct ${audios.id})`.as('audio_count')
      })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .leftJoin(audios, eq(audios.conversationId, conversations.id))
      .groupBy(conversations.id, users.id)
      .orderBy(desc(conversations.createdAt))
      .limit(limit)
      .offset(offset);
    
    return results.map(row => ({
      conversation: row.conversation,
      user: {
        id: row.userId,
        email: row.userEmail,
        name: row.userName
      },
      audioCount: row.audioCount
    }));
  }
  
  /**
   * Batch update conversation statuses
   */
  async batchUpdateStatuses(
    updates: Array<{ id: string; status: string }>
  ): Promise<void> {
    if (updates.length === 0) return;
    
    // Use a transaction for consistency
    await database.transaction(async (tx) => {
      // Build a CASE statement for efficient batch update
      const caseStatement = sql`
        CASE ${conversations.id}
        ${sql.join(
          updates.map(u => 
            sql`WHEN ${u.id} THEN ${u.status}`
          ),
          sql` `
        )}
        END
      `;
      
      await tx
        .update(conversations)
        .set({
          status: caseStatement,
          updatedAt: new Date()
        })
        .where(
          sql`${conversations.id} IN ${updates.map(u => u.id)}`
        );
    });
    
    log.info('Batch updated conversation statuses', { count: updates.length });
  }
  
  /**
   * Use loaders for N+1 prevention
   */
  async getConversationsWithLoaders(
    conversationIds: string[],
    loaders: LoaderContext
  ): Promise<Array<{
    conversation: any;
    user: any;
    audios: any[];
  }>> {
    // Load conversations
    const conversations = await loaders.conversationLoader.loadMany(conversationIds);
    
    // Extract user IDs and load users
    const userIds = conversations
      .filter(c => !(c instanceof Error) && c !== null)
      .map(c => (c as any).userId);
    
    const users = await loaders.userLoader.loadMany(userIds);
    
    // Load audios for all conversations
    const audiosForConversations = await loaders.conversationAudiosLoader.loadMany(conversationIds);
    
    // Combine results
    return conversationIds.map((id, index) => {
      const conversation = conversations[index];
      if (conversation instanceof Error || !conversation) {
        return null;
      }
      
      const user = users.find(u => 
        !(u instanceof Error) && u && u.id === conversation.userId
      );
      
      const audios = audiosForConversations[index];
      
      return {
        conversation,
        user: user || null,
        audios: audios instanceof Error ? [] : audios
      };
    }).filter(Boolean) as any[];
  }
}

export const optimizedConversationService = new OptimizedConversationService();