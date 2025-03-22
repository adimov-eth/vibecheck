import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { createClerkClient } from '@clerk/backend';
import { config } from '../../config';
import { authMiddleware } from '../middleware/auth.middleware';
import { log } from '../../utils/logger.utils';
import { getUserUsageStats } from '../../services/usage.service';

const router = express.Router();

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || config.clerkSecretKey,
});

// Apply auth middleware to all routes in this router
router.use(authMiddleware as RequestHandler);

router.get('/user', (async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const session = await clerk.sessions.getSession(token);
    const user = await clerk.users.getUser(session.userId);
    
    res.json({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    });
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)));
  }
}) as RequestHandler);

// Define route with inline handler but properly typed
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
      },
    });
  } catch (error) {
    log(`Error fetching usage stats: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
}) as RequestHandler);

export default router; 