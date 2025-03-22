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
      const { audioId } = job.data;
      log(`Starting audio processing job ${job.id} for audioId: ${audioId}`);

      const audio = await db
        .select()
        .from(audios)
        .where(eq(audios.id, audioId))
        .then(r => r[0]);
      if (!audio) throw new Error('Audio not found');

      await db.update(audios).set({ status: 'processing' }).where(eq(audios.id, audioId));

      const transcription = await transcribeAudio(audio.audioFile!);
      await deleteFile(audio.audioFile!);

      await db
        .update(audios)
        .set({ transcription, status: 'transcribed', audioFile: null })
        .where(eq(audios.id, audioId));

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
          .set({ status: 'processing' })
          .where(eq(conversations.id, audio.conversationId));
        await gptQueue.add('process_gpt', { conversationId: audio.conversationId });
      }

      const totalDuration = Date.now() - startTime;
      log(`Audio processing job ${job.id} completed in ${totalDuration}ms`);
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