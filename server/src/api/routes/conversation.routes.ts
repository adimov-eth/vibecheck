import express, { Request, Response, NextFunction } from 'express';
import { conversations } from '../../database/schema';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { canCreateConversation } from '../../services/usage.service';
import { log } from '../../utils/logger.utils';
import { authMiddleware } from '../middleware/auth.middleware';
import { PooledDatabase } from '../../database';

// Extend the Request type to include userId and db
interface AuthenticatedRequest extends Request {
  userId?: string;
  db: PooledDatabase;
}

const router = express.Router();

// Apply auth middleware to all conversation routes
router.use(authMiddleware as express.RequestHandler);

// Post route for creating a conversation
// @ts-ignore - Using type assertion to bypass Express router type issues
router.post('/', (req: any, res: any, next: any) => {
  (async () => {
    try {
      const customReq = req as AuthenticatedRequest;
      const { mode, recordingType } = customReq.body;
      const userId = customReq.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - User ID not found' });
      }
      
      const allowedModes = ['mediator', 'counselor', 'dinner', 'movie'];
      const allowedRecordingTypes = ['separate', 'live'];

      if (!mode || !allowedModes.includes(mode)) {
        return res.status(400).json({ error: 'Invalid or missing conversation mode' });
      }
      
      if (!recordingType || !allowedRecordingTypes.includes(recordingType)) {
        return res.status(400).json({ error: 'Invalid or missing recording type' });
      }

      // Check if user can create a new conversation
      const usageStatus = await canCreateConversation(userId, customReq.db);
      
      if (!usageStatus.canCreate) {
        return res.status(402).json({
          error: 'Usage limit reached',
          message: usageStatus.reason,
          usageStatus: {
            currentUsage: usageStatus.currentUsage,
            limit: usageStatus.limit,
            isSubscribed: usageStatus.isSubscribed
          }
        });
      }

      // Always generate a new UUID on the server, ignoring any client-provided ID
      const conversationId = uuid();

      // Insert the new conversation with user ID
      const now = new Date();
      await customReq.db.insert(conversations).values({
        id: conversationId,
        userId,
        mode,
        recordingType,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
      });

      // Log creation for monitoring
      log(`Created new conversation: ${conversationId} for user: ${userId}, mode: ${mode}`, 'info');

      res.status(201).json({ conversationId });
    } catch (error) {
      next(error);
    }
  })();
});

// Get route for retrieving a conversation
// @ts-ignore - Using type assertion to bypass Express router type issues
router.get('/:conversationId', (req: any, res: any, next: any) => {
  (async () => {
    try {
      const customReq = req as AuthenticatedRequest;
      const { conversationId } = customReq.params;
      const userId = customReq.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - User ID not found' });
      }
      
      const result = await customReq.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      
      const conversation = result[0];
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      // Security check: ensure users can only access their own conversations
      if (conversation.userId !== userId) {
        log(`Security alert: User ${userId} tried to access conversation ${conversationId} owned by ${conversation.userId}`, 'info');
        return res.status(403).json({ error: 'Forbidden - You do not have access to this conversation' });
      }
      
      res.json(conversation);
    } catch (error) {
      next(error);
    }
  })();
});

export default router;
