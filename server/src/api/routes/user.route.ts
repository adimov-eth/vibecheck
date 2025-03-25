import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import { getUserUsageStats } from '../../services/usage.service';
import { log } from '../../utils/logger.utils';

const router = express.Router();

router.get('/me', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.status(200).json({ 
      id: userId 
    });
  } catch (error) {
    log(`Error in get user endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

router.get('/stats', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized - User ID not found' });
    }

    const usageStats = await getUserUsageStats(userId, req.db);
    return res.status(200).json({
      usage: {
        currentUsage: usageStats.currentUsage,
        limit: usageStats.limit,
        isSubscribed: usageStats.isSubscribed,
        remainingConversations: usageStats.remainingConversations,
        resetDate: usageStats.resetDate instanceof Date ? usageStats.resetDate.toISOString() : usageStats.resetDate,
      }
    });
  } catch (error) {
    log(`Error fetching usage stats: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

export default router;