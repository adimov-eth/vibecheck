import { audioQueue, gptQueue } from '../queues';
import { log } from './logger.utils';
import { db } from '../database';
import { audios, conversations } from '../database/schema';
import { eq } from 'drizzle-orm';

/**
 * Cleans all jobs from the audio and GPT processing queues
 *
 * @param {boolean} cleanAudioQueue - Whether to clean the audio processing queue
 * @param {boolean} cleanGptQueue - Whether to clean the GPT processing queue
 * @returns {Promise<{ audioJobs: number, gptJobs: number }>} Number of jobs removed from each queue
 */
export async function cleanQueues(
  cleanAudioQueue = true,
  cleanGptQueue = true
): Promise<{ audioJobs: number; gptJobs: number }> {
  let audioJobs = 0;
  let gptJobs = 0;

  try {
    // Clean audio queue if requested
    if (cleanAudioQueue) {
      log('Cleaning audio processing queue...');

      // Get jobs in different states
      const waiting = await audioQueue.getWaiting();
      const active = await audioQueue.getActive();
      const delayed = await audioQueue.getDelayed();
      const failed = await audioQueue.getFailed();
      const completed = await audioQueue.getCompleted();

      // Remove jobs
      const jobs = [...waiting, ...active, ...delayed, ...failed, ...completed];
      for (const job of jobs) {
        await job.remove();
      }

      audioJobs = jobs.length;
      log(`Removed ${audioJobs} jobs from audio processing queue`);
    }

    // Clean GPT queue if requested
    if (cleanGptQueue) {
      log('Cleaning GPT processing queue...');

      // Get jobs in different states
      const waiting = await gptQueue.getWaiting();
      const active = await gptQueue.getActive();
      const delayed = await gptQueue.getDelayed();
      const failed = await gptQueue.getFailed();
      const completed = await gptQueue.getCompleted();

      // Remove jobs
      const jobs = [...waiting, ...active, ...delayed, ...failed, ...completed];
      for (const job of jobs) {
        await job.remove();
      }

      gptJobs = jobs.length;
      log(`Removed ${gptJobs} jobs from GPT processing queue`);
    }

    return { audioJobs, gptJobs };
  } catch (error) {
    log(
      `Error cleaning queues: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    throw error;
  }
}

/**
 * Drains queues by removing all jobs and closing the connections
 * Use this when shutting down the application
 */
export async function drainQueues(): Promise<void> {
  try {
    log('Draining audio and GPT queues...');

    // Clean all jobs first
    await cleanQueues();

    // Close connections
    await audioQueue.close();
    await gptQueue.close();

    log('Queues drained and connections closed');
  } catch (error) {
    log(
      `Error draining queues: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    throw error;
  }
}

/**
 * Restart GPT processing for a specific conversation
 * This will:
 * 1. Cancel any existing GPT jobs for this conversation
 * 2. Reset the conversation status to 'transcribed'
 * 3. Add a new GPT job for this conversation
 *
 * @param {string} conversationId - The ID of the conversation to restart
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function restartGptProcessing(
  conversationId: string
): Promise<boolean> {
  try {
    log(`Restarting GPT processing for conversation: ${conversationId}`);

    // Get all jobs in the GPT queue
    const waitingJobs = await gptQueue.getWaiting();
    const activeJobs = await gptQueue.getActive();
    const delayedJobs = await gptQueue.getDelayed();
    const failedJobs = await gptQueue.getFailed();

    // Combine all jobs
    const allJobs = [
      ...waitingJobs,
      ...activeJobs,
      ...delayedJobs,
      ...failedJobs,
    ];

    // Find and remove any jobs for this conversation
    let removed = 0;
    for (const job of allJobs) {
      if (job.data.conversationId === conversationId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      log(
        `Removed ${removed} existing GPT jobs for conversation: ${conversationId}`
      );
    }

    // Get the conversation to verify it exists
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .then(rows => rows[0]);

    if (!conversation) {
      log(`Conversation not found: ${conversationId}`, 'error');
      return false;
    }

    // Update the conversation status back to 'transcribed' to trigger reprocessing
    await db
      .update(conversations)
      .set({ status: 'transcribed' })
      .where(eq(conversations.id, conversationId));

    log(
      `Updated conversation status to 'transcribed' for conversation: ${conversationId}`
    );

    // Add a new job to the GPT queue
    await gptQueue.add('process_gpt', { conversationId });

    log(`Added new GPT job for conversation: ${conversationId}`);

    return true;
  } catch (error) {
    log(
      `Error restarting GPT processing: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    return false;
  }
}
