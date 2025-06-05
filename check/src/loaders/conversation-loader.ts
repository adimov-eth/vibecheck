import { BaseLoader } from './base-loader';
import { database } from '@/database';
import { conversations, audios } from '@/database/schema';
import { inArray, eq, desc, sql } from 'drizzle-orm';
import type { Conversation } from '@/types';

export class ConversationLoader extends BaseLoader<string, Conversation | null> {
  constructor() {
    super(async (conversationIds) => {
      // Batch load conversations by IDs
      const conversationsList = await database
        .select()
        .from(conversations)
        .where(inArray(conversations.id, conversationIds as string[]));
      
      const conversationMap = new Map(
        conversationsList.map(c => [c.id, c])
      );
      
      return conversationIds.map(id => conversationMap.get(id as string) || null);
    });
  }
}

export class UserConversationsLoader extends BaseLoader<string, Conversation[]> {
  constructor() {
    super(async (userIds) => {
      // Fetch all conversations for all users in one query
      const conversationsList = await database
        .select({
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
          // Aggregate audio information
          audioCount: sql<number>`count(${audios.id})`.as('audio_count'),
          totalAudioDuration: sql<number>`sum(${audios.duration})`.as('total_audio_duration')
        })
        .from(conversations)
        .leftJoin(audios, eq(audios.conversationId, conversations.id))
        .where(inArray(conversations.userId, userIds as string[]))
        .groupBy(conversations.id)
        .orderBy(desc(conversations.createdAt));
      
      // Group by user
      const userConversationsMap = new Map<string, Conversation[]>();
      for (const conversation of conversationsList) {
        const userId = conversation.userId;
        if (!userConversationsMap.has(userId)) {
          userConversationsMap.set(userId, []);
        }
        userConversationsMap.get(userId)!.push(conversation as Conversation);
      }
      
      // Return in order
      return userIds.map(id => userConversationsMap.get(id as string) || []);
    });
  }
}