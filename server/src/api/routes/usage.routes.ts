import express, { Response, NextFunction } from 'express';
import { getUserUsageStats } from '../../services/usage.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { log } from '../../utils/logger.utils';

// Extend the Request type to include userId
interface AuthenticatedRequest extends express.Request {
  userId?: string;
}

const router = express.Router();

// Apply auth middleware to all usage routes
router.use(authMiddleware);

/**
 * Get user's current usage statistics
 * GET /usage/stats
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized - User ID not found' });
    }
    
    const usageStats = await getUserUsageStats(userId);
    
    return res.status(200).json({
      usage: {
        currentUsage: usageStats.currentUsage,
        limit: usageStats.limit,
        isSubscribed: usageStats.isSubscribed,
        remainingConversations: usageStats.remainingConversations,
        resetDate: usageStats.resetDate,
      }
    });
  } catch (error) {
    log(`Error fetching usage stats: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
});

export default router; 