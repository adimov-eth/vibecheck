import { eq } from "drizzle-orm";

import { withDbConnection } from "../database";
import { conversations } from "../database/schema";
import { gptQueue } from "../queues";
import { log } from "../utils/logger.utils";

export async function restartGptProcessing(conversationId: string): Promise<boolean> {
  try {
    log(`Restarting GPT processing for conversation: ${conversationId}`);

    const waitingJobs = await gptQueue.getWaiting();
    const activeJobs = await gptQueue.getActive();
    const delayedJobs = await gptQueue.getDelayed();
    const failedJobs = await gptQueue.getFailed();
    const allJobs = [...waitingJobs, ...activeJobs, ...delayedJobs, ...failedJobs];

    let removed = 0;
    for (const job of allJobs) {
      if (job.data.conversationId === conversationId) {
        await job.remove();
        removed++;
      }
    }
    if (removed > 0) log(`Removed ${removed} existing GPT jobs for conversation: ${conversationId}`);

    const conversation = await withDbConnection(async (db) => {
      return await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .then(rows => rows[0]);
    });
    if (!conversation) {
      log(`Conversation not found: ${conversationId}`, 'error');
      return false;
    }

    await withDbConnection(async (db) => {
      await db
        .update(conversations)
        .set({ status: 'transcribed' })
        .where(eq(conversations.id, conversationId));
    });

    await gptQueue.add('process_gpt', { conversationId });
    log(`Added new GPT job for conversation: ${conversationId}`);
    return true;
  } catch (error) {
    log(`Error restarting GPT processing: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}