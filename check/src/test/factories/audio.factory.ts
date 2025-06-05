import { faker } from '@faker-js/faker';
import { drizzleDb as database } from '@/database/drizzle';
import { audios } from '@/database/schema';

export interface Audio {
  id: string;
  conversationId: string;
  filePath: string;
  duration: number;
  status: string;
  transcript?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AudioFactory {
  static build(overrides: Partial<Audio> = {}): Audio {
    return {
      id: faker.string.uuid(),
      conversationId: faker.string.uuid(),
      filePath: `uploads/${faker.string.alphanumeric(8)}/audio.mp3`,
      duration: faker.number.int({ min: 30, max: 600 }),
      status: faker.helpers.arrayElement(['uploaded', 'processing', 'completed', 'failed']),
      transcript: faker.lorem.paragraph(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides
    };
  }
  
  static async create(overrides: Partial<Audio> = {}): Promise<Audio> {
    const audio = this.build(overrides);
    
    const [created] = await database.insert(audios)
      .values({
        id: audio.id,
        conversationId: audio.conversationId,
        filePath: audio.filePath,
        duration: audio.duration,
        status: audio.status,
        transcript: audio.transcript,
        createdAt: audio.createdAt,
        updatedAt: audio.updatedAt
      })
      .returning();
    
    return created;
  }
  
  static buildMany(count: number, overrides: Partial<Audio> = {}): Audio[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }
  
  static async createMany(
    count: number,
    overrides: Partial<Audio> = {}
  ): Promise<Audio[]> {
    const audioList = this.buildMany(count, overrides);
    const created = await database.insert(audios)
      .values(audioList)
      .returning();
    
    return created;
  }
  
  static buildForConversation(
    conversationId: string,
    index: number = 1
  ): Partial<Audio> {
    return {
      conversationId,
      filePath: `uploads/${conversationId}/audio${index}.mp3`,
      status: 'uploaded',
      duration: faker.number.int({ min: 60, max: 300 })
    };
  }
}