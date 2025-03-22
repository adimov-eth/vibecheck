import dotenv from 'dotenv';
import express, { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import audioRoutes from './routes/audio.routes';
import subscriptionRoutes from './routes/subscription.routes';
import usageRoutes from './routes/usage.routes';
import userRoutes from './routes/user.routes';
import { config } from '../config';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { logger } from '../utils/logger.utils';
import { websocketManager } from '../utils/websocket.utils';
import {
  authRateLimiter,
  conversationsRateLimiter,
  audioRateLimiter,
  subscriptionsRateLimiter,
  usageRateLimiter,
  usersRateLimiter,
  defaultRateLimiter,
} from './middleware/rate-limit.middleware';
import { dbMiddleware } from './middleware/db.middleware';
import { audioQueue, gptQueue } from '../queues';
import { Job } from 'bullmq';
import { AudioJob, GptJob } from '../types';

dotenv.config();

export const createApp = () => {
  const app = express();
  const server = http.createServer(app);

  app.use(helmet());
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  const requestLogger: RequestHandler = (req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  };
  app.use(requestLogger);

  app.use(defaultRateLimiter as RequestHandler);

  app.use(clerkMiddleware({ debug: true }));

  // Attach database connection to each request
  app.use(dbMiddleware as RequestHandler);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const authLogger: RequestHandler = (req, res, next) => {
    const auth = getAuth(req as any);
    logger.debug(`Auth debug - Path: ${req.path}, userId: ${auth?.userId || 'none'}`);
    next();
  };
  app.use(authLogger);

  const healthCheck: RequestHandler = (req, res) => {
    res.status(200).json({ status: 'ok' });
  };
  app.get('/health', healthCheck);

  const clerkAuth = requireAuth({ secretKey: config.clerkSecretKey });

  app.use('/auth', authRateLimiter as RequestHandler, authRoutes);
  app.use('/conversations', clerkAuth, conversationsRateLimiter as RequestHandler, conversationRoutes);
  app.use('/audio', clerkAuth, audioRateLimiter as RequestHandler, audioRoutes);
  app.use('/subscriptions', subscriptionsRateLimiter as RequestHandler, subscriptionRoutes);
  app.use('/usage', clerkAuth, usageRateLimiter as RequestHandler, usageRoutes);
  app.use('/users', clerkAuth, usersRateLimiter as RequestHandler, userRoutes);

  const notFoundHandler: RequestHandler = (req, res) => {
    res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' });
  };
  app.use(notFoundHandler);

  app.use(errorHandler as ErrorRequestHandler);

  if (config.webSocket.enabled) {
    websocketManager.initialize(server);
    logger.info('WebSocket server initialized');
    
    // Set up queue listeners for real-time updates
    // @ts-ignore: BullMQ's event typing is problematic
    audioQueue.on('completed', (job: Job<AudioJob>) => {
      const { audioId, conversationId } = job.data;
      websocketManager.sendToConversation(conversationId, {
        type: 'audio_processed',
        payload: { audioId, status: 'transcribed' },
      });
      logger.info(`Sent WebSocket notification for audio ${audioId} in conversation ${conversationId}`);
    });
    
    // @ts-ignore: BullMQ's event typing is problematic
    audioQueue.on('failed', (job: Job<AudioJob>, err: Error) => {
      const { audioId, conversationId } = job.data;
      websocketManager.sendToConversation(conversationId, {
        type: 'audio_failed',
        payload: { audioId, error: err.message },
      });
      logger.error(`Sent WebSocket notification for failed audio ${audioId} in conversation ${conversationId}: ${err.message}`);
    });
    
    // @ts-ignore: BullMQ's event typing is problematic
    gptQueue.on('completed', (job: Job<GptJob>) => {
      const { conversationId } = job.data;
      websocketManager.sendToConversation(conversationId, {
        type: 'conversation_completed',
        payload: { conversationId, status: 'completed' },
      });
      logger.info(`Sent WebSocket notification for completed conversation ${conversationId}`);
    });
    
    // @ts-ignore: BullMQ's event typing is problematic
    gptQueue.on('failed', (job: Job<GptJob>, err: Error) => {
      const { conversationId } = job.data;
      websocketManager.sendToConversation(conversationId, {
        type: 'conversation_failed',
        payload: { conversationId, error: err.message },
      });
      logger.error(`Sent WebSocket notification for failed conversation ${conversationId}: ${err.message}`);
    });
  }

  return server;
};