declare module 'express' {
  interface Request {
    userId?: string;
  }
}
import { createClerkClient } from '@clerk/backend';
import { config } from '../../config';
import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || config.clerkSecretKey,
});
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionToken = req.headers.authorization?.split(' ')[1];
    if (!sessionToken) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const session = await clerk.sessions.getSession(sessionToken);
    if (!session || !session.userId) {
      return res
        .status(401)
        .json({ error: 'Invalid or expired session token' });
    }

    req.userId = session.userId;
    next();
  } catch (error) {
    log(
      `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    res.status(401).json({ error: 'Authentication failed' });
  }
};
