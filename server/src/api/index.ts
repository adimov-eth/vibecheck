// server/src/api/index.ts
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { ErrorRequestHandler, RequestHandler } from 'express';
import helmet from 'helmet';
import http from 'http';
import { config } from '../config';
import { createOrUpdateUser, deleteUser } from '../services/user.service';
import { logger } from '../utils/logger.utils';
import { websocketManager } from '../utils/websocket.utils';
import { dbMiddleware, PooledDatabase } from './middleware/db.middleware';
import { errorHandler } from './middleware/error.middleware';
import {
  audioRateLimiter,
  authRateLimiter,
  conversationsRateLimiter,
  defaultRateLimiter,
  subscriptionsRateLimiter,
  usageRateLimiter
} from './middleware/rate-limit.middleware';
import audioRoutes from './routes/audio.routes';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import subscriptionRoutes from './routes/subscription.routes';
import usageRoutes from './routes/usage.routes';
import userRoutes from './routes/user.route';

dotenv.config();

// Extend Express Request type
declare module 'express' {
  interface Request {
    db?: PooledDatabase;
  }
}

export const createApp = () => {
  const app = express();
  const server = http.createServer(app);

  app.use(helmet());
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  app.use(clerkMiddleware({ secretKey: config.clerkSecretKey }));
  app.use(defaultRateLimiter as RequestHandler);
  app.use(dbMiddleware as RequestHandler);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const requestLogger: RequestHandler = (req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  };
  app.use(requestLogger);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Custom webhook endpoint for Clerk user synchronization
  app.post('/webhooks/clerk', async (req, res) => {
    try {
      const payload = JSON.stringify(req.body);
      const headers = req.headers;

      // Verify webhook signature
      const signature = headers['x-clerk-signature'] as string;
      const timestamp = headers['x-clerk-timestamp'] as string;
      const signingSecret = config.clerkWebhookSecret;

      if (!signingSecret) {
        throw new Error('CLERK_WEBHOOK_SECRET is not defined');
      }

      const computedSignature = crypto
        .createHmac('sha256', signingSecret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      if (computedSignature !== signature) {
        throw new Error('Invalid signature');
      }

      const event = req.body;

      switch (event.type) {
        case 'user.created':
        case 'user.updated':
          await createOrUpdateUser({
            id: event.data.id,
            email: event.data.email_addresses?.[0]?.email_address,
            name: `${event.data.first_name || ''} ${event.data.last_name || ''}`.trim() || undefined,
          }, req.db!);
          logger.info(`User ${event.type}: ${event.data.id}`);
          break;
        case 'user.deleted':
          await deleteUser(event.data.id, req.db!);
          logger.info(`User deleted: ${event.data.id}`);
          break;
        default:
          logger.warn(`Unhandled webhook event type: ${event.type}`);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`Webhook error: ${error instanceof Error ? error.message : String(error)}`);
      res.status(400).json({ error: 'Webhook processing failed', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Mount routes with rate limiting
  app.use('/auth', authRateLimiter as RequestHandler, authRoutes);
  app.use('/conversations', conversationsRateLimiter as RequestHandler, conversationRoutes);
  app.use('/audio', audioRateLimiter as RequestHandler, audioRoutes);
  app.use('/subscriptions', subscriptionsRateLimiter as RequestHandler, subscriptionRoutes);
  app.use('/usage', usageRateLimiter as RequestHandler, usageRoutes);
  app.use('/users', usageRateLimiter as RequestHandler, userRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' });
  });

  app.use(errorHandler as ErrorRequestHandler);

  if (config.webSocket.enabled) {
    websocketManager.initialize(server);
    logger.info('WebSocket server initialized');
  }

  return server;
};