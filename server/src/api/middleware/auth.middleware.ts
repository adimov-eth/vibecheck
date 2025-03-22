declare module 'express' {
  interface Request {
    userId?: string;
  }
}
import { createClerkClient } from '@clerk/backend';
import { config } from '../../config';
import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';
import { createOrUpdateUser } from '../../services/user.service';

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
    
    try {
      // Get user data from Clerk
      const clerkUser = await clerk.users.getUser(session.userId);
      
      // Create or update user in our database
      await createOrUpdateUser({
        id: session.userId,
        email: clerkUser.emailAddresses?.[0]?.emailAddress,
        name: clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : undefined
      });
    } catch (userError) {
      // Log error but continue - don't block the request if user sync fails
      log(`Error syncing user data: ${userError instanceof Error ? userError.message : String(userError)}`, 'error');
    }
    
    next();
  } catch (error) {
    log(
      `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    res.status(401).json({ error: 'Authentication failed' });
  }
};
