import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { getUserUsageStats } from '../../services/usage.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { log } from '../../utils/logger.utils';

const router = express.Router();

// Apply auth middleware to all usage routes
router.use(authMiddleware as RequestHandler);

/**
 * Get user's current usage statistics
 * GET /usage/stats
 */
router.get('/stats', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    
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