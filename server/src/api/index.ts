import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import audioRoutes from './routes/audio.routes';
import subscriptionRoutes from './routes/subscription.routes';
import usageRoutes from './routes/usage.routes';
import userRoutes from './routes/user.routes';
import { config } from '../config';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';

dotenv.config();

export const createApp = () => {
  const app = express();

  app.use(
    clerkMiddleware({
      debug: true, // Enable debug mode for development
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const clerkAuth = requireAuth({
    secretKey: config.clerkSecretKey,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    console.log(
      `Auth debug - Path: ${req.path}, userId: ${auth?.userId || 'none'}`
    );
    next();
  });

  app.use('/auth', authRoutes);
  app.use('/conversations', clerkAuth, conversationRoutes);
  app.use('/audio', clerkAuth, audioRoutes);
  app.use('/subscriptions', subscriptionRoutes);
  app.use('/usage', clerkAuth, usageRoutes);
  app.use('/users', clerkAuth, userRoutes);

  app.use((req, res, next) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    errorHandler(err, req, res, next);
  });

  return app;
};
