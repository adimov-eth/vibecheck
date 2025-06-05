import { RateLimiterRedis, RateLimiterRes, RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from '@/config';
import { rateLimitConfig } from '@/config/rate-limits';
import { log } from '@/utils/logger';
import { createClient } from 'redis';

// Create a separate Redis client for rate limiting
const redisClient = createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`,
  password: config.redis.password
});

redisClient.on('error', (err) => {
  log.error('Redis client error for rate limiting:', err);
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    log.info('Rate limiter Redis client connected');
  } catch (error) {
    log.error('Failed to connect rate limiter Redis client:', error);
  }
})();

// IP-based rate limiter
export const ipRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_ip',
  points: rateLimitConfig.auth.maxAttempts.perIP,
  duration: rateLimitConfig.auth.windowMs / 1000, // Convert to seconds
  blockDuration: rateLimitConfig.auth.blockDuration / 1000, // Convert to seconds
  execEvenly: false,
});

// Email-based rate limiter
export const emailRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_email',
  points: rateLimitConfig.auth.maxAttempts.perEmail,
  duration: 60 * 60, // 1 hour in seconds
  blockDuration: rateLimitConfig.auth.blockDuration / 1000,
  execEvenly: false,
});

// Progressive delay tracker
export const progressiveDelayLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_progressive',
  points: rateLimitConfig.auth.progressiveDelays.length - 1, // Max attempts before block
  duration: rateLimitConfig.auth.windowMs / 1000,
  blockDuration: rateLimitConfig.auth.blockDuration / 1000,
  execEvenly: false,
});

// CAPTCHA attempt limiter
export const captchaAttemptLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_captcha',
  points: rateLimitConfig.auth.maxAttempts.beforeCaptcha,
  duration: rateLimitConfig.auth.windowMs / 1000,
  blockDuration: 0, // No auto-block, just track attempts
  execEvenly: false,
});

// Memory fallback for when Redis is down
const memoryFallback = new RateLimiterMemory({
  points: rateLimitConfig.auth.maxAttempts.perIP,
  duration: rateLimitConfig.auth.windowMs / 1000,
  blockDuration: rateLimitConfig.auth.blockDuration / 1000,
});

// Auth Rate Limiter class
export class AuthRateLimiter {
  static async checkIP(ip: string): Promise<RateLimiterRes> {
    try {
      return await ipRateLimiter.consume(ip);
    } catch (error) {
      if (error instanceof Error) {
        log.error('IP rate limiter error, falling back to memory:', error);
        return await memoryFallback.consume(ip);
      }
      throw error;
    }
  }

  static async checkEmail(email: string): Promise<RateLimiterRes> {
    try {
      return await emailRateLimiter.consume(email.toLowerCase());
    } catch (error) {
      if (error instanceof Error) {
        log.error('Email rate limiter error:', error);
        // For email, we don't fall back to memory as it's per-user
        throw error;
      }
      throw error;
    }
  }

  static async getProgressiveDelay(identifier: string): Promise<number> {
    try {
      const res = await progressiveDelayLimiter.get(identifier);
      const attemptCount = res ? res.consumedPoints : 0;
      const delays = rateLimitConfig.auth.progressiveDelays;
      
      if (attemptCount >= delays.length) {
        // Max delay reached, account is likely blocked
        return delays[delays.length - 1];
      }
      
      return delays[attemptCount] || 0;
    } catch (error) {
      log.error('Progressive delay limiter error:', error);
      return 0;
    }
  }

  static async incrementProgressiveDelay(identifier: string): Promise<void> {
    try {
      await progressiveDelayLimiter.consume(identifier);
    } catch (error) {
      // If blocked, that's expected behavior
      if (error instanceof Error && 'remainingPoints' in error) {
        return;
      }
      log.error('Error incrementing progressive delay:', error);
    }
  }

  static async resetProgressiveDelay(identifier: string): Promise<void> {
    try {
      await progressiveDelayLimiter.delete(identifier);
    } catch (error) {
      log.error('Error resetting progressive delay:', error);
    }
  }

  static async checkCaptchaRequired(identifier: string): Promise<boolean> {
    try {
      const res = await captchaAttemptLimiter.get(identifier);
      return res ? res.consumedPoints >= rateLimitConfig.auth.maxAttempts.beforeCaptcha : false;
    } catch (error) {
      log.error('Error checking CAPTCHA requirement:', error);
      return false;
    }
  }

  static async incrementCaptchaAttempts(identifier: string): Promise<void> {
    try {
      await captchaAttemptLimiter.consume(identifier);
    } catch (error) {
      // Expected when limit is reached
      if (error instanceof Error && 'remainingPoints' in error) {
        return;
      }
      log.error('Error incrementing CAPTCHA attempts:', error);
    }
  }

  static async resetCaptchaAttempts(identifier: string): Promise<void> {
    try {
      await captchaAttemptLimiter.delete(identifier);
    } catch (error) {
      log.error('Error resetting CAPTCHA attempts:', error);
    }
  }

  static async resetAllLimits(identifier: string, email?: string): Promise<void> {
    try {
      await Promise.all([
        ipRateLimiter.delete(identifier),
        progressiveDelayLimiter.delete(identifier),
        captchaAttemptLimiter.delete(identifier),
        email ? emailRateLimiter.delete(email.toLowerCase()) : Promise.resolve()
      ]);
    } catch (error) {
      log.error('Error resetting all limits:', error);
    }
  }
}

// Login Attempt Tracker
export class LoginAttemptTracker {
  private static readonly keyPrefix = 'login_attempt:';
  private static readonly ttl = rateLimitConfig.auth.windowMs / 1000; // Convert to seconds

  static async recordFailedAttempt(details: {
    ip: string;
    email?: string;
    reason: string;
    timestamp?: number;
  }): Promise<void> {
    const { ip, email, reason, timestamp = Date.now() } = details;
    const key = `${this.keyPrefix}${ip}`;
    
    try {
      const attempt = JSON.stringify({
        ip,
        email,
        reason,
        timestamp
      });
      
      await redisClient.rPush(key, attempt);
      await redisClient.expire(key, this.ttl);
      
      // Also track by email if provided
      if (email) {
        const emailKey = `${this.keyPrefix}email:${email.toLowerCase()}`;
        await redisClient.rPush(emailKey, attempt);
        await redisClient.expire(emailKey, this.ttl);
      }
    } catch (error) {
      log.error('Error recording failed login attempt:', error);
    }
  }

  static async getFailedAttempts(identifier: string, windowSeconds: number): Promise<Array<{
    ip: string;
    email?: string;
    reason: string;
    timestamp: number;
  }>> {
    const key = `${this.keyPrefix}${identifier}`;
    const cutoff = Date.now() - (windowSeconds * 1000);
    
    try {
      const attempts = await redisClient.lRange(key, 0, -1);
      return attempts
        .map(attempt => JSON.parse(attempt))
        .filter(attempt => attempt.timestamp >= cutoff);
    } catch (error) {
      log.error('Error getting failed attempts:', error);
      return [];
    }
  }

  static async isBlocked(identifier: string): Promise<boolean> {
    try {
      // Check IP block
      const ipBlocked = await ipRateLimiter.get(identifier);
      if (ipBlocked && ipBlocked.remainingPoints === 0) {
        return true;
      }

      // Check progressive delay block
      const progressiveBlocked = await progressiveDelayLimiter.get(identifier);
      if (progressiveBlocked && progressiveBlocked.remainingPoints === 0) {
        return true;
      }

      return false;
    } catch (error) {
      log.error('Error checking block status:', error);
      return false;
    }
  }
}

// Export rate limiter instances for direct use if needed
export const rateLimiters = {
  ip: ipRateLimiter,
  email: emailRateLimiter,
  progressiveDelay: progressiveDelayLimiter,
  captcha: captchaAttemptLimiter,
  memory: memoryFallback
};