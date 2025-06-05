import { BaseLoader } from './base-loader';
import { database } from '@/database';
import { audios } from '@/database/schema';
import { inArray, eq } from 'drizzle-orm';

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

export class AudioLoader extends BaseLoader<string, Audio | null> {
  constructor() {
    super(async (audioIds) => {
      const audiosList = await database
        .select()
        .from(audios)
        .where(inArray(audios.id, audioIds as string[]));
      
      const audioMap = new Map(audiosList.map(a => [a.id, a]));
      return audioIds.map(id => audioMap.get(id as string) || null);
    });
  }
}

export class ConversationAudiosLoader extends BaseLoader<string, Audio[]> {
  constructor() {
    super(async (conversationIds) => {
      // Batch load all audios for multiple conversations
      const audiosList = await database
        .select()
        .from(audios)
        .where(inArray(audios.conversationId, conversationIds as string[]));
      
      // Group by conversation ID
      const conversationAudiosMap = new Map<string, Audio[]>();
      for (const audio of audiosList) {
        const convId = audio.conversationId;
        if (!conversationAudiosMap.has(convId)) {
          conversationAudiosMap.set(convId, []);
        }
        conversationAudiosMap.get(convId)!.push(audio);
      }
      
      return conversationIds.map(id => 
        conversationAudiosMap.get(id as string) || []
      );
    });
  }
}