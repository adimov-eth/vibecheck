import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { conversations, audios } from '@/database/schema';
import type { Conversation } from '@/types';

export class ConversationFactory {
  static build(overrides: Partial<Conversation> = {}): Conversation {
    return {
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      mode: faker.helpers.arrayElement(['therapy', 'coaching', 'interview']),
      recordingType: faker.helpers.arrayElement(['separate', 'live']),
      status: faker.helpers.arrayElement(['waiting', 'processing', 'completed', 'failed']),
      duration: faker.number.int({ min: 60, max: 3600 }),
      transcript: faker.lorem.paragraphs(3),
      analysis: {
        summary: faker.lorem.paragraph(),
        sentiment: faker.helpers.arrayElement(['positive', 'neutral', 'negative']),
        mood: faker.helpers.arrayElement(['happy', 'calm', 'anxious', 'sad']),
        keyPoints: faker.lorem.sentences(3).split('.').filter(s => s.trim()),
        recommendations: faker.lorem.sentences(2).split('.').filter(s => s.trim())
      },
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
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
        duration: conversation.duration,
        transcript: conversation.transcript,
        analysis: conversation.analysis,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      })
      .returning();
    
    return created;
  }
  
  static buildMany(count: number, overrides: Partial<Conversation> = {}): Conversation[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }
  
  static async createMany(
    count: number, 
    overrides: Partial<Conversation> = {}
  ): Promise<Conversation[]> {
    const conversations = this.buildMany(count, overrides);
    const created = await database.insert(conversations)
      .values(conversations)
      .returning();
    
    return created;
  }
  
  static async createWithAudios(
    conversationOverrides: Partial<Conversation> = {},
    audioCount = 2
  ): Promise<{
    conversation: Conversation;
    audios: any[];
  }> {
    const conversation = await this.create(conversationOverrides);
    
    const audioData = Array.from({ length: audioCount }, (_, i) => ({
      id: faker.string.uuid(),
      conversationId: conversation.id,
      filePath: `uploads/${conversation.id}/audio${i + 1}.mp3`,
      duration: faker.number.int({ min: 30, max: 300 }),
      status: 'completed',
      transcript: faker.lorem.paragraph(),
      createdAt: new Date(conversation.createdAt.getTime() + i * 60000),
      updatedAt: faker.date.recent()
    }));
    
    const createdAudios = await database.insert(audios)
      .values(audioData)
      .returning();
    
    return { conversation, audios: createdAudios };
  }
  
  static buildPending(userId: string): Partial<Conversation> {
    return {
      userId,
      status: 'waiting',
      duration: 0,
      transcript: null,
      analysis: null
    };
  }
  
  static buildCompleted(userId: string): Partial<Conversation> {
    return {
      userId,
      status: 'completed',
      duration: faker.number.int({ min: 300, max: 1800 }),
      transcript: faker.lorem.paragraphs(5),
      analysis: {
        summary: faker.lorem.paragraph(),
        sentiment: 'positive',
        mood: 'calm',
        keyPoints: [
          'Key insight about the conversation',
          'Important topic discussed',
          'Action item identified'
        ],
        recommendations: [
          'Consider exploring this topic further',
          'Practice the discussed techniques'
        ]
      }
    };
  }
}