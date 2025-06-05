import { Request, Response, NextFunction } from 'express';
import { AuthRateLimiter, LoginAttemptTracker } from '@/services/rate-limiter-service';
import { rateLimitConfig } from '@/config/rate-limits';
import { log } from '@/utils/logger';

// Helper to get client IP
const getClientIP = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

// Helper to set rate limit headers
const setRateLimitHeaders = (res: Response, limiterRes: any, isBlocked: boolean = false): void => {
  res.setHeader('X-RateLimit-Limit', limiterRes.totalPoints || rateLimitConfig.auth.maxAttempts.perIP);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limiterRes.remainingPoints || 0));
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + (limiterRes.msBeforeNext || 0)).toISOString());
  
  if (isBlocked && limiterRes.msBeforeNext) {
    res.setHeader('Retry-After', Math.round(limiterRes.msBeforeNext / 1000));
  }
};

// IP-based rate limiting middleware
export const rateLimiterByIP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIP(req);
  
  try {
    const limiterRes = await AuthRateLimiter.checkIP(ip);
    setRateLimitHeaders(res, limiterRes);
    next();
  } catch (rateLimiterRes: any) {
    setRateLimitHeaders(res, rateLimiterRes, true);
    
    log.warn(`Rate limit exceeded for IP: ${ip}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000)
    });
  }
};

// Email-based rate limiting middleware factory
export const rateLimiterByEmail = (emailExtractor: (req: Request) => string | undefined) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const email = emailExtractor(req);
    
    if (!email) {
      // If no email, skip email-based limiting
      return next();
    }
    
    try {
      const limiterRes = await AuthRateLimiter.checkEmail(email);
      // We don't set headers for email-based limiting to avoid leaking user existence
      next();
    } catch (rateLimiterRes: any) {
      log.warn(`Rate limit exceeded for email: ${email}`);
      
      // Use generic error to avoid leaking that the email exists
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000)
      });
    }
  };
};

// Progressive delay middleware
export const progressiveDelayMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIP(req);
  
  try {
    const delay = await AuthRateLimiter.getProgressiveDelay(ip);
    
    if (delay > 0) {
      log.info(`Applying ${delay}ms progressive delay for IP: ${ip}`);
      
      // Apply the delay
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    next();
  } catch (error) {
    log.error('Error in progressive delay middleware:', error);
    next(); // Continue on error
  }
};

// CAPTCHA check middleware
export const captchaMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIP(req);
  
  try {
    const captchaRequired = await AuthRateLimiter.checkCaptchaRequired(ip);
    
    if (captchaRequired) {
      // Check if CAPTCHA response is provided
      const captchaToken = req.body.captchaToken || req.headers['x-captcha-token'];
      
      if (!captchaToken) {
        return res.status(403).json({
          error: 'CAPTCHA Required',
          message: 'Too many failed attempts. Please complete the CAPTCHA.',
          captchaRequired: true
        });
      }
      
      // Validate CAPTCHA (this will be implemented in captcha-service.ts)
      // For now, we'll just check if it exists
      // TODO: Implement actual CAPTCHA validation
      
      // If CAPTCHA is valid, reset the CAPTCHA attempts
      await AuthRateLimiter.resetCaptchaAttempts(ip);
    }
    
    next();
  } catch (error) {
    log.error('Error in CAPTCHA middleware:', error);
    next(); // Continue on error
  }
};

// Combined auth rate limit middleware
export const authRateLimitMiddleware = {
  byIP: rateLimiterByIP,
  byEmail: rateLimiterByEmail,
  progressive: progressiveDelayMiddleware,
  captcha: captchaMiddleware,
  
  // Helper to record failed attempts
  recordFailure: async (req: Request, email?: string, reason: string = 'Invalid credentials'): Promise<void> => {
    const ip = getClientIP(req);
    
    try {
      // Record the failed attempt
      await LoginAttemptTracker.recordFailedAttempt({
        ip,
        email,
        reason
      });
      
      // Increment progressive delay
      await AuthRateLimiter.incrementProgressiveDelay(ip);
      
      // Increment CAPTCHA attempts
      await AuthRateLimiter.incrementCaptchaAttempts(ip);
      
      // Increment email attempts if provided
      if (email) {
        await AuthRateLimiter.incrementCaptchaAttempts(`email:${email.toLowerCase()}`);
      }
    } catch (error) {
      log.error('Error recording auth failure:', error);
    }
  },
  
  // Helper to reset limits on successful auth
  recordSuccess: async (req: Request, email?: string): Promise<void> => {
    const ip = getClientIP(req);
    
    try {
      await AuthRateLimiter.resetAllLimits(ip, email);
    } catch (error) {
      log.error('Error resetting auth limits:', error);
    }
  }
};

// Environment variable check for feature flag
export const isRateLimitingEnabled = (): boolean => {
  return process.env.RATE_LIMITING_ENABLED !== 'false';
};