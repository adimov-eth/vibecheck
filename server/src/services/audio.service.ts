// /Users/adimov/Developer/vibecheck/server/src/services/audio.service.ts
import { eq } from 'drizzle-orm';
import { PooledDatabase } from '../database';
import { audios } from '../database/schema';
import { log } from '../utils/logger.utils';

export interface AudioRecord {
  id: string;
  conversationId: string;
  userId: string;
  audioFile: string | null;
  transcription?: string | null;
  status: 'pending' | 'processing' | 'transcribed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string | null;
}

export async function createAudioRecord({
  conversationId,
  userId,
  audioFile,
  db,
}: {
  conversationId: string;
  userId: string;
  audioFile: string;
  db: PooledDatabase;
}): Promise<AudioRecord> {
  try {
    const [audio] = await db
      .insert(audios)
      .values({
        conversationId,
        userId,
        audioFile,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return audio;
  } catch (error) {
    log(`Error creating audio record: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

export async function getAudioById(audioId: string, userId: string, db: PooledDatabase): Promise<AudioRecord | null> {
  try {
    const [audio] = await db
      .select()
      .from(audios)
      .where(eq(audios.id, audioId))
      .where(eq(audios.userId, userId));
    return audio || null;
  } catch (error) {
    log(`Error fetching audio by ID: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

export async function getConversationAudios(conversationId: string, db: PooledDatabase): Promise<AudioRecord[]> {
  try {
    const result = await db
      .select()
      .from(audios)
      .where(eq(audios.conversationId, conversationId));
    return result;
  } catch (error) {
    log(`Error fetching conversation audios: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

export async function updateAudioStatus(audioId: string, status: string, db: PooledDatabase): Promise<void> {
  try {
    await db
      .update(audios)
      .set({ status, updatedAt: new Date() })
      .where(eq(audios.id, audioId));
  } catch (error) {
    log(`Error updating audio status: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}