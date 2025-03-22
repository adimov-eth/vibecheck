import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  getUserById,
  createOrUpdateUser,
  getAllUsers
} from '../../services/user.service';
import { log } from '../../utils/logger.utils';

const router = express.Router();

// Apply auth middleware to all user routes
router.use(authMiddleware as RequestHandler);

/**
 * Get current user profile
 * GET /users/me
 */
router.get(
  '/me',
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in request' });
      }
      
      const user = await getUserById(userId, req.db);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.status(200).json({ user });
    } catch (error) {
      log(`Error in get user endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }) as RequestHandler
);

/**
 * Get all users (admin only)
 * GET /users
 */
router.get(
  '/',
  ( async (req: Request, res: Response, next: NextFunction) => {
    try {
      // In a production app, you would add admin role checking here
      const users = await getAllUsers(req.db);
      res.status(200).json({ users });
    } catch (error) {
      log(`Error in get all users endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }) as RequestHandler
);

export default router;