// server/src/api/routes/conversation.routes.ts
import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { gptQueue } from '../../queues';
import {
  createConversation,
  getConversationById,
  getUserConversations,
  updateConversationStatus
} from '../../services/conversation.service';
import { hasActiveSubscription } from '../../services/subscription.service';
import { getUserUsageStats } from '../../services/usage.service';
import { logger } from '../../utils/logger.utils';
import { requireAuth } from '../middleware/auth.middleware';
import { PooledDatabase } from '../middleware/db.middleware';

const router = express.Router();

const createConversationSchema = z.object({
  mode: z.string(),
  recordingType: z.string(),
});

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new Error('Unauthorized');

    const validationResult = createConversationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: validationResult.error.errors });
    }

    const subscription = await hasActiveSubscription(userId, req.db as PooledDatabase);
    const usageStats = await getUserUsageStats(userId, req.db as PooledDatabase);

    if (!subscription.isActive && usageStats.remainingConversations <= 0) {
      return res.status(403).json({
        error: 'Usage limit reached',
        details: 'Please subscribe to continue using the service'
      });
    }

    const { mode, recordingType } = validationResult.data;
    const conversation = await createConversation({
      userId,
      mode,
      recordingType,
      db: req.db as PooledDatabase
    });

    res.status(201).json({ conversation });
  } catch (error) {
    logger.error(`Error in create conversation: ${error instanceof Error ? error.message : String(error)}`);
    next(error);
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new Error('Unauthorized');

    const conversation = await getConversationById(req.params.id, userId, req.db as PooledDatabase);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json({ conversation });
  } catch (error) {
    logger.error(`Error in get conversation: ${error instanceof Error ? error.message : String(error)}`);
    next(error);
  }
});

router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new Error('Unauthorized');

    const conversations = await getUserConversations(userId, req.db as PooledDatabase);
    res.status(200).json({ conversations });
  } catch (error) {
    logger.error(`Error in get conversations: ${error instanceof Error ? error.message : String(error)}`);
    next(error);
  }
});

router.post('/:id/process', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new Error('Unauthorized');

    const conversationId = req.params.id;
    const conversation = await getConversationById(conversationId, userId, req.db as PooledDatabase);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.status === 'processing') {
      return res.status(400).json({ error: 'Conversation is already being processed' });
    }

    await updateConversationStatus(conversationId, 'processing', req.db as PooledDatabase);
    await gptQueue.add('process-conversation', { conversationId, userId });

    res.status(202).json({ message: 'Processing started', conversationId });
  } catch (error) {
    logger.error(`Error in process conversation: ${error instanceof Error ? error.message : String(error)}`);
    next(error);
  }
});

export default router;