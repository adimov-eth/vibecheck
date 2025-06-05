import { createClient } from 'redis';
import { config } from '@/config';
import { rateLimitConfig } from '@/config/rate-limits';
import { log } from '@/utils/logger';

// Create a Redis client for failed login tracking
const redisClient = createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`,
  password: config.redis.password
});

redisClient.on('error', (err) => {
  log.error('Redis client error for failed login service:', err);
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    log.info('Failed login service Redis client connected');
  } catch (error) {
    log.error('Failed to connect failed login service Redis client:', error);
  }
})();

export interface FailedLoginAttempt {
  ip: string;
  email?: string;
  reason: string;
  timestamp: number;
}

export class FailedLoginService {
  private static readonly KEY_PREFIX = 'failed_login:';
  private static readonly COUNTER_PREFIX = 'failed_login_count:';
  private static readonly LOCKOUT_PREFIX = 'account_locked:';
  
  // Record a failed login attempt
  static async recordFailedAttempt(details: Omit<FailedLoginAttempt, 'timestamp'>): Promise<void> {
    const attempt: FailedLoginAttempt = {
      ...details,
      timestamp: Date.now()
    };
    
    try {
      // Store by IP
      const ipKey = `${this.KEY_PREFIX}ip:${details.ip}`;
      await redisClient.rPush(ipKey, JSON.stringify(attempt));
      await redisClient.expire(ipKey, rateLimitConfig.auth.windowMs / 1000);
      
      // Store by email if provided
      if (details.email) {
        const emailKey = `${this.KEY_PREFIX}email:${details.email.toLowerCase()}`;
        await redisClient.rPush(emailKey, JSON.stringify(attempt));
        await redisClient.expire(emailKey, 3600); // 1 hour for email-based tracking
      }
      
      // Increment counters
      await this.incrementFailureCount(details.ip, 'ip');
      if (details.email) {
        await this.incrementFailureCount(details.email.toLowerCase(), 'email');
      }
      
      log.info('Failed login attempt recorded', { ip: details.ip, email: details.email, reason: details.reason });
    } catch (error) {
      log.error('Error recording failed login attempt:', error);
    }
  }
  
  // Get failed attempts for an identifier within a time window
  static async getFailedAttempts(identifier: string, windowSeconds: number): Promise<FailedLoginAttempt[]> {
    const keys = [
      `${this.KEY_PREFIX}ip:${identifier}`,
      `${this.KEY_PREFIX}email:${identifier.toLowerCase()}`
    ];
    
    const cutoff = Date.now() - (windowSeconds * 1000);
    const allAttempts: FailedLoginAttempt[] = [];
    
    try {
      for (const key of keys) {
        const attempts = await redisClient.lRange(key, 0, -1);
        const parsedAttempts = attempts
          .map(attempt => JSON.parse(attempt) as FailedLoginAttempt)
          .filter(attempt => attempt.timestamp >= cutoff);
        
        allAttempts.push(...parsedAttempts);
      }
      
      // Remove duplicates and sort by timestamp
      const uniqueAttempts = Array.from(
        new Map(allAttempts.map(a => [`${a.ip}-${a.timestamp}`, a])).values()
      ).sort((a, b) => b.timestamp - a.timestamp);
      
      return uniqueAttempts;
    } catch (error) {
      log.error('Error getting failed attempts:', error);
      return [];
    }
  }
  
  // Reset failed attempts for an identifier
  static async resetFailedAttempts(identifier: string): Promise<void> {
    const keys = [
      `${this.KEY_PREFIX}ip:${identifier}`,
      `${this.KEY_PREFIX}email:${identifier.toLowerCase()}`,
      `${this.COUNTER_PREFIX}ip:${identifier}`,
      `${this.COUNTER_PREFIX}email:${identifier.toLowerCase()}`,
      `${this.COUNTER_PREFIX}captcha:${identifier}`
    ];
    
    try {
      await redisClient.del(keys);
      log.info('Failed attempts reset for identifier:', identifier);
    } catch (error) {
      log.error('Error resetting failed attempts:', error);
    }
  }
  
  // Check if an identifier is blocked
  static async isBlocked(identifier: string): Promise<boolean> {
    try {
      // Check IP block
      const ipCount = await this.getFailureCount(identifier, 'ip');
      if (ipCount >= rateLimitConfig.auth.maxAttempts.perIP) {
        return true;
      }
      
      // Check email block (if identifier looks like email)
      if (identifier.includes('@')) {
        const emailCount = await this.getFailureCount(identifier.toLowerCase(), 'email');
        if (emailCount >= rateLimitConfig.auth.maxAttempts.perEmail) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      log.error('Error checking block status:', error);
      return false;
    }
  }
  
  // Increment failure count for tracking
  static async incrementFailureCount(identifier: string, type: 'ip' | 'email' | 'captcha'): Promise<number> {
    const key = `${this.COUNTER_PREFIX}${type}:${identifier}`;
    const ttl = type === 'email' ? 3600 : rateLimitConfig.auth.windowMs / 1000;
    
    try {
      const count = await redisClient.incr(key);
      await redisClient.expire(key, ttl);
      return count;
    } catch (error) {
      log.error('Error incrementing failure count:', error);
      return 0;
    }
  }
  
  // Get current failure count
  static async getFailureCount(identifier: string, type: 'ip' | 'email' | 'captcha'): Promise<number> {
    const key = `${this.COUNTER_PREFIX}${type}:${identifier}`;
    
    try {
      const count = await redisClient.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      log.error('Error getting failure count:', error);
      return 0;
    }
  }
  
  // Account lockout methods
  static async lockAccount(email: string, reason: string = 'Too many failed login attempts'): Promise<void> {
    const key = `${this.LOCKOUT_PREFIX}${email.toLowerCase()}`;
    const lockoutData = {
      email: email.toLowerCase(),
      reason,
      lockedAt: Date.now(),
      unlockToken: this.generateUnlockToken()
    };
    
    try {
      await redisClient.set(key, JSON.stringify(lockoutData), {
        EX: 24 * 3600 // 24 hour lockout
      });
      
      log.warn('Account locked', { email, reason });
      
      // TODO: Send security email to user
    } catch (error) {
      log.error('Error locking account:', error);
    }
  }
  
  static async isAccountLocked(email: string): Promise<boolean> {
    const key = `${this.LOCKOUT_PREFIX}${email.toLowerCase()}`;
    
    try {
      const lockData = await redisClient.get(key);
      return !!lockData;
    } catch (error) {
      log.error('Error checking account lock status:', error);
      return false;
    }
  }
  
  static async unlockAccount(email: string): Promise<void> {
    const key = `${this.LOCKOUT_PREFIX}${email.toLowerCase()}`;
    
    try {
      await redisClient.del(key);
      await this.resetFailedAttempts(email);
      log.info('Account unlocked:', email);
    } catch (error) {
      log.error('Error unlocking account:', error);
    }
  }
  
  static async getAccountLockInfo(email: string): Promise<any | null> {
    const key = `${this.LOCKOUT_PREFIX}${email.toLowerCase()}`;
    
    try {
      const lockData = await redisClient.get(key);
      return lockData ? JSON.parse(lockData) : null;
    } catch (error) {
      log.error('Error getting account lock info:', error);
      return null;
    }
  }
  
  // Generate a secure unlock token
  private static generateUnlockToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
  
  // Get statistics for monitoring
  static async getStatistics(windowMinutes: number = 60): Promise<{
    failedAttemptsByIP: Record<string, number>;
    failedAttemptsByEmail: Record<string, number>;
    blockedIPs: string[];
    lockedAccounts: string[];
  }> {
    try {
      // This is a simplified version. In production, you'd want more efficient scanning
      const stats = {
        failedAttemptsByIP: {} as Record<string, number>,
        failedAttemptsByEmail: {} as Record<string, number>,
        blockedIPs: [] as string[],
        lockedAccounts: [] as string[]
      };
      
      // Get all IP counters
      const ipKeys = await redisClient.keys(`${this.COUNTER_PREFIX}ip:*`);
      for (const key of ipKeys) {
        const ip = key.replace(`${this.COUNTER_PREFIX}ip:`, '');
        const count = await this.getFailureCount(ip, 'ip');
        if (count > 0) {
          stats.failedAttemptsByIP[ip] = count;
          if (count >= rateLimitConfig.auth.maxAttempts.perIP) {
            stats.blockedIPs.push(ip);
          }
        }
      }
      
      // Get all email counters
      const emailKeys = await redisClient.keys(`${this.COUNTER_PREFIX}email:*`);
      for (const key of emailKeys) {
        const email = key.replace(`${this.COUNTER_PREFIX}email:`, '');
        const count = await this.getFailureCount(email, 'email');
        if (count > 0) {
          stats.failedAttemptsByEmail[email] = count;
        }
      }
      
      // Get locked accounts
      const lockKeys = await redisClient.keys(`${this.LOCKOUT_PREFIX}*`);
      stats.lockedAccounts = lockKeys.map(key => key.replace(this.LOCKOUT_PREFIX, ''));
      
      return stats;
    } catch (error) {
      log.error('Error getting statistics:', error);
      return {
        failedAttemptsByIP: {},
        failedAttemptsByEmail: {},
        blockedIPs: [],
        lockedAccounts: []
      };
    }
  }
}