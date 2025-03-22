import { PooledDatabase } from '../database';
import { conversations } from '../database/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export class ConversationService {
  constructor(private db: PooledDatabase) {}

  async createConversation(userId: string, mode: string, recordingType: string) {
    const id = uuid();
    const now = new Date();
    await this.db.insert(conversations).values({
      id,
      userId,
      mode,
      recordingType,
      status: 'waiting',
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async getConversation(conversationId: string) {
    const result = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    return result[0];
  }
}