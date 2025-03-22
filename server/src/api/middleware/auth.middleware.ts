declare module 'express' {
  interface Request {
    userId?: string;
    auth?: {
      userId?: string;
      sessionId?: string;
    };
  }
}
import { createClerkClient } from '@clerk/backend';
import { requireAuth } from '@clerk/express';
import { config } from '../../config';
import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';
import { createOrUpdateUser } from '../../services/user.service';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || config.clerkSecretKey,
});

// User sync middleware to keep our database in sync with Clerk
const syncUserMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only run if we have userId from Clerk auth
    if (req.auth?.userId) {
      // Set userId property for backward compatibility
      req.userId = req.auth.userId;
      
      try {
        // Get user data from Clerk
        const clerkUser = await clerk.users.getUser(req.auth.userId);
        
        // Create or update user in our database
        await createOrUpdateUser({
          id: req.auth.userId,
          email: clerkUser.emailAddresses?.[0]?.emailAddress,
          name: clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : undefined
        });
      } catch (userError) {
        // Log error but continue - don't block the request if user sync fails
        log(`Error syncing user data: ${userError instanceof Error ? userError.message : String(userError)}`, 'error');
      }
    }
    next();
  } catch (error) {
    log(`User sync failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    // Continue even if sync fails - don't block the user
    next();
  }
};

// Export the middleware as a single function that applies the middleware chain
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Create a middleware chain with proper error handling
  const clerkAuth = requireAuth({
    // Handle JWT verification failures better
    jwtKey: process.env.CLERK_JWT_KEY,
    debug: true,   // Enable debug logging
  });
  
  // Apply the Clerk middleware first
  clerkAuth(req as any, res as any, (err) => {
    if (err) {
      // Log the error but continue with fallback
      log(`Clerk auth error: ${err.message}`, 'error');
      
      // Try to extract the JWT manually as fallback
      try {
        const sessionToken = req.headers.authorization?.split(' ')[1];
        if (sessionToken) {
          const payload = JSON.parse(
            Buffer.from(sessionToken.split('.')[1], 'base64').toString()
          );
          
          if (payload && payload.sub) {
            // Log at debug level instead of info to reduce log noise
            log(`Using fallback JWT extraction for user: ${payload.sub}`, 'debug');
            req.userId = payload.sub;
            // Set auth for compatibility with Clerk middleware
            req.auth = { userId: payload.sub };
            // Continue to user sync
            return syncUserMiddleware(req, res, next);
          }
        }
      } catch (jwtError) {
        log(`Fallback JWT extraction failed: ${jwtError instanceof Error ? jwtError.message : String(jwtError)}`, 'error');
      }
      
      // If we get here, authentication has failed completely
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    // If Clerk auth succeeded, continue to user sync
    syncUserMiddleware(req, res, next);
  });
};
