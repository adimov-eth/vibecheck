import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.utils.js';

/**
 * Create a rate limiter middleware for a specific route category
 * @param category The route category (e.g., 'auth', 'conversations')
 * @param options Optional additional rate limit options
 */
export const createRateLimiter = (
  category: keyof typeof config.rateLimit.maxRequestsPerWindow,
  options = {}
) => {
  const max = config.rateLimit.maxRequestsPerWindow[category] || 
              config.rateLimit.maxRequestsPerWindow.default;
  
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    message: {
      status: 'error',
      message: config.rateLimit.message
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use user ID if available, otherwise use IP
      const auth = req.auth as any;
      return auth?.userId || req.ip || 'unknown';
    },
    handler: (req: Request, res: Response, next: NextFunction, options: any) => {
      logger.warn(`Rate limit exceeded for ${category} by ${req.ip || 'unknown'}`);
      res.status(429).json(options.message);
    },
    skip: (req: Request) => {
      // Skip rate limiting for health check or status endpoints
      return req.path === '/health' || req.path === '/status';
    },
    ...options
  });

  return limiter;
};

// Create rate limiters for each route category
export const authRateLimiter = createRateLimiter('auth');
export const conversationsRateLimiter = createRateLimiter('conversations');
export const audioRateLimiter = createRateLimiter('audio');
export const subscriptionsRateLimiter = createRateLimiter('subscriptions');
export const usageRateLimiter = createRateLimiter('usage');
export const usersRateLimiter = createRateLimiter('users');

// Default rate limiter for routes without a specific limiter
export const defaultRateLimiter = createRateLimiter('default');