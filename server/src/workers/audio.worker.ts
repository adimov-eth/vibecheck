import { Worker } from 'bullmq';
import { getDbConnection } from '../database';
import { audios, conversations } from '../database/schema';
import { eq } from 'drizzle-orm';
import { transcribeAudio } from '../utils/openai.utils';
import { deleteFile } from '../utils/file.utils';
import { gptQueue } from '../queues';
import { log } from '../utils/logger.utils';
import { config } from '../config';

const worker = new Worker(
  'audioProcessing',
  async job => {
    const db = getDbConnection();
    try {
      const startTime = Date.now();
      const { audioId, conversationId } = job.data;
      log(`Starting audio processing job ${job.id} for audioId: ${audioId}`);

      const audio = await db
        .select()
        .from(audios)
        .where(eq(audios.id, audioId))
        .then(r => r[0]);
      
      if (!audio) {
        throw new Error(`Audio ${audioId} not found or missing file path`);
      }
      
      if (!audio.audioFile) {
        throw new Error(`Audio file path is missing for audio ${audioId}`);
      }

      await db
        .update(audios)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(audios.id, audioId));

      // Transcribe the audio
      const transcription = await transcribeAudio(audio.audioFile);
      
      // Update the database with the transcription
      await db
        .update(audios)
        .set({ 
          transcription, 
          status: 'transcribed', 
          audioFile: null, 
          updatedAt: new Date() 
        })
        .where(eq(audios.id, audioId));
      
      // Delete the audio file only after successful transcription and database update
      await deleteFile(audio.audioFile);

      const conversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, audio.conversationId))
        .then(r => r[0]);

      const transcribedCount = await db
        .select()
        .from(audios)
        .where(eq(audios.conversationId, audio.conversationId))
        .then(r => r.filter(a => a.status === 'transcribed').length);
      
      const requiredAudios = conversation.recordingType === 'separate' ? 2 : 1;

      if (transcribedCount === requiredAudios) {
        await db
          .update(conversations)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(conversations.id, audio.conversationId));
        
        // Add GPT processing job with retry options
        await gptQueue.add(
          'process_gpt', 
          { conversationId: audio.conversationId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          }
        );
      }

      const totalDuration = Date.now() - startTime;
      log(`Audio processing job ${job.id} completed in ${totalDuration}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Audio processing failed for job ${job.id}: ${errorMessage}`, 'error');
      
      try {
        // Update audio status to failed
        await db
          .update(audios)
          .set({ 
            status: 'failed', 
            errorMessage, 
            updatedAt: new Date() 
          })
          .where(eq(audios.id, job.data.audioId));
      } catch (dbError) {
        log(`Failed to update audio status: ${dbError instanceof Error ? dbError.message : String(dbError)}`, 'error');
      }
      
      // Rethrow the error for BullMQ to handle retries
      throw error;
    } finally {
      db.release();
    }
  },
  { connection: config.redis, concurrency: 3 }
);

worker.on('active', job => log(`Audio job ${job.id} started processing`));
worker.on('completed', job => log(`Audio job ${job.id} completed successfully`));
worker.on('failed', (job, err) => log(`Audio job ${job?.id} failed: ${err.message}`, 'error'));
worker.on('stalled', jobId => log(`Audio job ${jobId} stalled`, 'error'));
worker.on('error', error => log(`Audio worker error: ${error.message}`, 'error'));

export default worker;