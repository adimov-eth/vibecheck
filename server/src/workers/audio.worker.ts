import { Worker } from 'bullmq';
import { db } from '../database';
import { audios, conversations } from '../database/schema';
import { eq } from 'drizzle-orm';
import { transcribeAudio } from '../utils/openai.utils';
import { deleteFile } from '../utils/file.utils';
import { gptQueue } from '../queues';
import { log } from '../utils/logger.utils';
import { config } from '../config'; // workers/audioProcessing.ts

const worker = new Worker(
  'audioProcessing',
  async job => {
    const startTime = Date.now();
    const { audioId } = job.data;
    log(`Starting audio processing job ${job.id} for audioId: ${audioId}`);

    // Fetch audio record
    log(`Fetching audio record for audioId: ${audioId}`);
    const audio = await db
      .select()
      .from(audios)
      .where(eq(audios.id, audioId))
      .then(r => r[0]);

    if (!audio) {
      log(`Audio not found for audioId: ${audioId}`, 'error');
      throw new Error('Audio not found');
    }
    log(
      `Audio record found. File path: ${audio.audioFile}, Conversation ID: ${audio.conversationId}`
    );

    // Update audio status to processing
    log(`Updating audio status to "processing" for audioId: ${audioId}`);
    await db
      .update(audios)
      .set({ status: 'processing' })
      .where(eq(audios.id, audioId));
    log(`Status updated to "processing" for audioId: ${audioId}`);

    // Transcribe audio
    log(`Starting transcription for audio file: ${audio.audioFile}`);
    const transcriptionStartTime = Date.now();
    const transcription = await transcribeAudio(audio.audioFile!);
    const transcriptionDuration = Date.now() - transcriptionStartTime;
    log(
      `Transcription completed in ${transcriptionDuration}ms. Length: ${transcription.length} characters`
    );
    console.log('Transcription:', transcription);
    // Delete audio file
    log(`Deleting audio file: ${audio.audioFile}`);
    await deleteFile(audio.audioFile!);
    log(`Audio file deleted: ${audio.audioFile}`);

    // Update database with transcription
    log(`Updating database with transcription for audioId: ${audioId}`);
    await db
      .update(audios)
      .set({ transcription, status: 'transcribed', audioFile: null })
      .where(eq(audios.id, audioId));
    log(`Database updated with transcription. Status set to "transcribed"`);

    // Fetch conversation
    log(
      `Fetching conversation details for conversationId: ${audio.conversationId}`
    );
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, audio.conversationId))
      .then(r => r[0]);
    log(
      `Conversation details retrieved. Recording type: ${conversation.recordingType}`
    );

    // Check transcription progress
    log(
      `Checking transcription progress for conversation: ${audio.conversationId}`
    );
    const transcribedCount = await db
      .select()
      .from(audios)
      .where(eq(audios.conversationId, audio.conversationId))
      .then(r => r.filter(a => a.status === 'transcribed').length);
    const requiredAudios = conversation.recordingType === 'separate' ? 2 : 1;
    log(
      `Transcription progress: ${transcribedCount}/${requiredAudios} audios transcribed`
    );

    // If all required audios are transcribed, update conversation and queue GPT processing
    if (transcribedCount === requiredAudios) {
      log(
        `All required audios (${requiredAudios}) have been transcribed for conversation: ${audio.conversationId}`
      );
      log(`Updating conversation status to "processing"`);
      await db
        .update(conversations)
        .set({ status: 'processing' })
        .where(eq(conversations.id, audio.conversationId));

      log(`Queueing GPT processing for conversation: ${audio.conversationId}`);
      await gptQueue.add('process_gpt', {
        conversationId: audio.conversationId,
      });
      log(`GPT processing queued successfully`);
    } else {
      log(
        `Waiting for ${requiredAudios - transcribedCount} more audio(s) to be transcribed for conversation: ${audio.conversationId}`
      );
    }

    const totalDuration = Date.now() - startTime;
    log(`Audio processing job ${job.id} completed in ${totalDuration}ms`);
  },
  { connection: config.redis }
);

// Worker event handlers
worker.on('active', job => log(`Audio job ${job.id} started processing`));
worker.on('completed', job =>
  log(`Audio job ${job.id} completed successfully`)
);
worker.on('failed', (job, err) => {
  log(`Audio job ${job?.id} failed: ${err.message}`, 'error');
  log(`Error stack: ${err.stack}`, 'error');
});
worker.on('stalled', jobId => log(`Audio job ${jobId} stalled`, 'error'));
worker.on('error', error =>
  log(`Audio worker error: ${error.message}`, 'error')
);

// Export worker for shutdown handling in main application
export default worker;
