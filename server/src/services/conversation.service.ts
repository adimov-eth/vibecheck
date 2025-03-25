// /Users/adimov/Developer/vibecheck/server/src/services/conversation.service.ts
import { eq } from 'drizzle-orm';
import { PooledDatabase } from '../database';
import { conversations } from '../database/schema';
import { log } from '../utils/logger.utils';

export interface Conversation {
  id: string;
  userId: string;
  mode: string;
  recordingType: 'separate' | 'live';
  status: 'pending' | 'processing' | 'transcribed' | 'completed' | 'failed';
  gptResponse?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getConversationById(
  conversationId: string,
  userId: string,
  db: PooledDatabase
): Promise<Conversation | null> {
  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .where(eq(conversations.userId, userId));
    return conversation || null;
  } catch (error) {
    log(`Error fetching conversation by ID: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}