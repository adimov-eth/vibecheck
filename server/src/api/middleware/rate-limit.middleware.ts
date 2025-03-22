import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger.utils';

// Add custom properties to Request type
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userSubscription?: {
        isActive: boolean;
      };
    }
  }
}

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests within windowMs
  standardHeaders: boolean; // Send standard rate limit headers
  legacyHeaders: boolean; // Send legacy rate limit headers
  message?: string; // Optional custom message
  keyGenerator?: (req: Request) => string; // Function to generate a unique key per request
  skip?: (req: Request, res: Response) => boolean; // Function to skip rate limiting for certain requests
  statusCode?: number; // HTTP status code when rate limit is exceeded
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory storage for rate limiting
const stores: { [key: string]: RateLimitStore } = {};

// Cleanup function to prevent memory leaks
const cleanupStores = () => {
  const now = Date.now();
  Object.keys(stores).forEach(storeName => {
    const store = stores[storeName];
    Object.keys(store).forEach(key => {
      if (store[key].resetTime <= now) {
        delete store[key];
      }
    });
  });
};

// Run cleanup every 10 minutes
setInterval(cleanupStores, 10 * 60 * 1000);

// Default options
const defaultOptions: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  keyGenerator: (req: Request) => {
    return req.ip || 'unknown';
  },
  skip: (_req: Request, _res: Response) => false
};

// Create a rate limiter middleware
export const createRateLimiter = (
  name: string,
  options: Partial<RateLimitOptions> = {}
) => {
  // Merge options with defaults
  const opts: RateLimitOptions = { ...defaultOptions, ...options };
  
  // Create store if it doesn't exist
  if (!stores[name]) {
    stores[name] = {};
  }
  
  const store = stores[name];

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if skip function returns true
    if (opts.skip && opts.skip(req, res)) {
      return next();
    }

    // Use the keyGenerator function (defaultOptions ensures it exists)
    const key = opts.keyGenerator!(req);
    const now = Date.now();

    // Initialize or reset entry if it doesn't exist or has expired
    if (!store[key] || store[key].resetTime <= now) {
      store[key] = {
        count: 0,
        resetTime: now + opts.windowMs
      };
    }

    // Increment request count
    store[key].count += 1;

    // Calculate headers
    const currentCount = store[key].count;
    const remainingRequests = Math.max(0, opts.max - currentCount);
    const resetTime = store[key].resetTime;
    const timeToReset = Math.ceil((resetTime - now) / 1000); // in seconds

    // Set headers if enabled
    if (opts.standardHeaders) {
      res.setHeader('RateLimit-Limit', opts.max);
      res.setHeader('RateLimit-Remaining', remainingRequests);
      res.setHeader('RateLimit-Reset', Math.ceil(resetTime / 1000)); // Unix timestamp in seconds
    }

    if (opts.legacyHeaders) {
      res.setHeader('X-RateLimit-Limit', opts.max);
      res.setHeader('X-RateLimit-Remaining', remainingRequests);
      res.setHeader('X-RateLimit-Reset', timeToReset);
    }

    // Check if rate limit is exceeded
    if (currentCount > opts.max) {
      log(`Rate limit exceeded: ${key} on route ${req.path}`, 'warn');
      
      // Set retry-after header
      res.setHeader('Retry-After', timeToReset);
      
      // Determine status code
      const statusCode = opts.statusCode || 429;
      
      // Send error response
      return res.status(statusCode).json({
        error: opts.message || 'Too many requests, please try again later.'
      });
    }

    next();
  };
};

// More restrictive limits for API endpoints
export const apiRateLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests from this IP, please try again later'
});

// Stricter limits for auth-related endpoints
export const authRateLimiter = createRateLimiter('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: 'Too many authentication attempts, please try again later'
});

// Special limits for file uploads
export const uploadRateLimiter = createRateLimiter('uploads', {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: 'Upload limit reached, please try again later'
});

// Special limits for conversation creation
export const conversationsRateLimiter = createRateLimiter('conversations', {
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10, // 10 conversations per 30 minutes for free users
  message: 'Conversation creation limit reached, please try again later',
  keyGenerator: (req: Request) => {
    // Use userId for rate limiting when available, fall back to IP
    if (req.userId) return `user:${req.userId}`;
    return req.ip || 'unknown';
  },
  // Skip rate limiting for premium users
  skip: (req: Request, _res: Response) => {
    return !!(req.userSubscription && req.userSubscription.isActive);
  }
});