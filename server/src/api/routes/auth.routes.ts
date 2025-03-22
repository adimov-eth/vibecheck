import express, { NextFunction, Request, Response, RequestHandler } from 'express';
import { createClerkClient } from '@clerk/backend';
import { config } from '../../config';
const router = express.Router();
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || config.clerkSecretKey,
});

// We'll use Clerk's hosted authentication pages and JWT verification
// The frontend will handle the actual authentication flow
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
      name: `${user.firstName} ${user.lastName}`.trim(),
    });
  } catch (error) {
    // Pass authentication errors to the error handler
    next(error);
  }
}) as RequestHandler);

export default router;
