import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import audioRoutes from './routes/audio.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import usageRoutes from './routes/usage.routes.js';
import userRoutes from './routes/user.routes.js';
import { config } from '../config.js';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { logger } from '../utils/logger.utils.js';
import { websocketManager } from '../utils/websocket.utils.js';
import { 
  authRateLimiter, 
  conversationsRateLimiter, 
  audioRateLimiter,
  subscriptionsRateLimiter,
  usageRateLimiter,
  usersRateLimiter,
  defaultRateLimiter
} from './middleware/rate-limit.middleware.js';

dotenv.config();

export const createApp = () => {
  // Create Express app
  const app = express();
  
  // Create HTTP server using Express app
  const server = http.createServer(app);
  
  // Security middleware
  app.use(helmet());
  
  // CORS middleware
  app.use(cors({
    origin: '*', // Or specify your domains
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
  
  // Apply default rate limiter to all routes
  app.use(defaultRateLimiter);

  // Clerk authentication middleware
  app.use(
    clerkMiddleware({
      debug: true, // Enable debug mode for development
    })
  );

  // Parse JSON request bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Clerk auth middleware for protected routes
  const clerkAuth = requireAuth({
    secretKey: config.clerkSecretKey,
  });

  // Debug middleware for auth
  app.use((req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    logger.debug(
      `Auth debug - Path: ${req.path}, userId: ${auth?.userId || 'none'}`
    );
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Apply route-specific rate limiters
  app.use('/auth', authRateLimiter, authRoutes);
  app.use('/conversations', clerkAuth, conversationsRateLimiter, conversationRoutes);
  app.use('/audio', clerkAuth, audioRateLimiter, audioRoutes);
  app.use('/subscriptions', subscriptionsRateLimiter, subscriptionRoutes);
  app.use('/usage', clerkAuth, usageRateLimiter, usageRoutes);
  app.use('/users', clerkAuth, usersRateLimiter, userRoutes);

  // 404 handler
  app.use((req, res, next) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    errorHandler(err, req, res, next);
  });

  // Initialize WebSocket server if enabled
  if (config.webSocket.enabled) {
    websocketManager.initialize(server);
    logger.info('WebSocket server initialized');
  }

  return server;
};
