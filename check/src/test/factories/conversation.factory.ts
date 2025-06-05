import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { conversations, type Conversation, type NewConversation } from '@/database/schema';

export class ConversationFactory {
  static build(overrides: Partial<Conversation> = {}): Conversation {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      mode: faker.helpers.arrayElement(['Interview Practice', 'Presentation Practice', 'Daily Standup']),
      recordingType: faker.helpers.arrayElement(['separate', 'live']) as 'separate' | 'live',
      status: faker.helpers.arrayElement(['waiting', 'transcribing', 'analyzing', 'completed', 'error']),
      gptResponse: faker.datatype.boolean() ? JSON.stringify({
        communicationStyle: faker.lorem.sentence(),
        emotionalTone: faker.lorem.word(),
        keyPoints: [faker.lorem.sentence(), faker.lorem.sentence()],
        suggestions: [faker.lorem.sentence()]
      }) : null,
      errorMessage: null,
      createdAt: now - 86400, // 1 day ago
      updatedAt: now,
      ...overrides
    };
  }
  
  static async create(overrides: Partial<Conversation> = {}): Promise<Conversation> {
    const conversation = this.build(overrides);
    
    const [created] = await database.insert(conversations)
      .values({
        id: conversation.id,
        userId: conversation.userId,
        mode: conversation.mode,
        recordingType: conversation.recordingType,
        status: conversation.status,
        gptResponse: conversation.gptResponse,
        errorMessage: conversation.errorMessage,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      })
      .returning();
    
    return created;
  }
  
  static buildMany(count: number, overrides: Partial<Conversation> = {}): Conversation[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }
  
  static async createMany(count: number, overrides: Partial<Conversation> = {}): Promise<Conversation[]> {
    const conversationsToCreate = this.buildMany(count, overrides);
    const created = await database.insert(conversations)
      .values(conversationsToCreate)
      .returning();
    
    return created;
  }
  
  static async createWithAudios(audioCount: number = 1, overrides: Partial<Conversation> = {}): Promise<{
    conversation: Conversation;
    audios: any[];
  }> {
    const conversation = await this.create(overrides);
    
    // Import AudioFactory here to avoid circular dependency
    const { AudioFactory } = await import('./audio.factory');
    
    const audios = await AudioFactory.createMany(audioCount, {
      conversationId: conversation.id,
      userId: conversation.userId
    });
    
    return { conversation, audios };
  }
  
  static buildCompleted(overrides: Partial<Conversation> = {}): Conversation {
    return this.build({
      status: 'completed',
      gptResponse: JSON.stringify({
        communicationStyle: 'Clear and professional',
        emotionalTone: 'Confident',
        keyPoints: ['Good structure', 'Clear delivery'],
        suggestions: ['Add more examples', 'Vary tone']
      }),
      ...overrides
    });
  }
  
  static buildError(overrides: Partial<Conversation> = {}): Conversation {
    return this.build({
      status: 'error',
      errorMessage: 'Transcription failed',
      ...overrides
    });
  }
}