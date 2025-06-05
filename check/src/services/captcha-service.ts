import { createClient } from 'redis';
import { config } from '@/config';
import { rateLimitConfig } from '@/config/rate-limits';
import { log } from '@/utils/logger';
import crypto from 'crypto';

// Create a Redis client for CAPTCHA service
const redisClient = createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`,
  password: config.redis.password
});

redisClient.on('error', (err) => {
  log.error('Redis client error for CAPTCHA service:', err);
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    log.info('CAPTCHA service Redis client connected');
  } catch (error) {
    log.error('Failed to connect CAPTCHA service Redis client:', error);
  }
})();

export interface CaptchaChallenge {
  challengeId: string;
  question: string;
  type: 'math' | 'text';
}

export interface CaptchaValidationResult {
  valid: boolean;
  message?: string;
}

export class CaptchaService {
  private static readonly KEY_PREFIX = 'captcha:';
  private static readonly STATS_PREFIX = 'captcha_stats:';
  
  // Generate a simple math CAPTCHA
  static async generateCaptchaChallenge(): Promise<CaptchaChallenge> {
    const challengeId = crypto.randomBytes(16).toString('hex');
    
    // Generate simple math problem
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer: number;
    let question: string;
    
    switch (operator) {
      case '+':
        answer = num1 + num2;
        question = `What is ${num1} + ${num2}?`;
        break;
      case '-':
        answer = num1 - num2;
        question = `What is ${num1} - ${num2}?`;
        break;
      case '*':
        answer = num1 * num2;
        question = `What is ${num1} × ${num2}?`;
        break;
      default:
        answer = num1 + num2;
        question = `What is ${num1} + ${num2}?`;
    }
    
    try {
      // Store the answer in Redis with TTL
      const key = `${this.KEY_PREFIX}${challengeId}`;
      await redisClient.set(key, answer.toString(), {
        EX: rateLimitConfig.auth.captchaTTL
      });
      
      // Track CAPTCHA generation
      await this.incrementStat('generated');
      
      log.info('CAPTCHA challenge generated', { challengeId, type: 'math' });
      
      return {
        challengeId,
        question,
        type: 'math'
      };
    } catch (error) {
      log.error('Error generating CAPTCHA challenge:', error);
      throw new Error('Failed to generate CAPTCHA challenge');
    }
  }
  
  // Validate CAPTCHA response
  static async validateCaptchaResponse(challengeId: string, userResponse: string): Promise<CaptchaValidationResult> {
    const key = `${this.KEY_PREFIX}${challengeId}`;
    
    try {
      // Get the correct answer
      const correctAnswer = await redisClient.get(key);
      
      if (!correctAnswer) {
        await this.incrementStat('expired');
        return {
          valid: false,
          message: 'CAPTCHA has expired. Please request a new one.'
        };
      }
      
      // Delete the challenge to prevent reuse
      await redisClient.del(key);
      
      // Normalize answers for comparison
      const isValid = userResponse.trim().toLowerCase() === correctAnswer.toLowerCase();
      
      // Track validation attempt
      await this.incrementStat(isValid ? 'solved' : 'failed');
      
      if (isValid) {
        log.info('CAPTCHA solved successfully', { challengeId });
        return {
          valid: true,
          message: 'CAPTCHA verified successfully'
        };
      } else {
        log.info('CAPTCHA validation failed', { challengeId });
        return {
          valid: false,
          message: 'Incorrect answer. Please try again.'
        };
      }
    } catch (error) {
      log.error('Error validating CAPTCHA response:', error);
      return {
        valid: false,
        message: 'Error validating CAPTCHA. Please try again.'
      };
    }
  }
  
  // Generate a CAPTCHA token for verified challenges
  static async generateCaptchaToken(ip: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `${this.KEY_PREFIX}token:${token}`;
    
    try {
      // Store token with IP and timestamp
      await redisClient.set(key, JSON.stringify({
        ip,
        timestamp: Date.now(),
        used: false
      }), {
        EX: 300 // 5 minute validity
      });
      
      return token;
    } catch (error) {
      log.error('Error generating CAPTCHA token:', error);
      throw new Error('Failed to generate CAPTCHA token');
    }
  }
  
  // Verify CAPTCHA token
  static async verifyCaptchaToken(token: string, ip: string): Promise<boolean> {
    const key = `${this.KEY_PREFIX}token:${token}`;
    
    try {
      const data = await redisClient.get(key);
      
      if (!data) {
        return false;
      }
      
      const tokenData = JSON.parse(data);
      
      // Check if token matches IP and hasn't been used
      if (tokenData.ip === ip && !tokenData.used) {
        // Mark as used
        tokenData.used = true;
        await redisClient.set(key, JSON.stringify(tokenData), {
          EX: 60 // Keep for 1 minute after use for debugging
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      log.error('Error verifying CAPTCHA token:', error);
      return false;
    }
  }
  
  // Track CAPTCHA statistics
  private static async incrementStat(type: 'generated' | 'solved' | 'failed' | 'expired'): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const hourKey = `${this.STATS_PREFIX}${today}:${new Date().getHours()}:${type}`;
    const dayKey = `${this.STATS_PREFIX}${today}:${type}`;
    
    try {
      await Promise.all([
        redisClient.incr(hourKey),
        redisClient.incr(dayKey),
        redisClient.expire(hourKey, 7 * 24 * 3600), // Keep hourly stats for 7 days
        redisClient.expire(dayKey, 30 * 24 * 3600) // Keep daily stats for 30 days
      ]);
    } catch (error) {
      log.error('Error incrementing CAPTCHA stat:', error);
    }
  }
  
  // Get CAPTCHA statistics
  static async getStatistics(date?: string): Promise<{
    generated: number;
    solved: number;
    failed: number;
    expired: number;
    solveRate: number;
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
      const [generated, solved, failed, expired] = await Promise.all([
        redisClient.get(`${this.STATS_PREFIX}${targetDate}:generated`),
        redisClient.get(`${this.STATS_PREFIX}${targetDate}:solved`),
        redisClient.get(`${this.STATS_PREFIX}${targetDate}:failed`),
        redisClient.get(`${this.STATS_PREFIX}${targetDate}:expired`)
      ]);
      
      const stats = {
        generated: parseInt(generated || '0', 10),
        solved: parseInt(solved || '0', 10),
        failed: parseInt(failed || '0', 10),
        expired: parseInt(expired || '0', 10),
        solveRate: 0
      };
      
      // Calculate solve rate
      const totalAttempts = stats.solved + stats.failed;
      if (totalAttempts > 0) {
        stats.solveRate = (stats.solved / totalAttempts) * 100;
      }
      
      return stats;
    } catch (error) {
      log.error('Error getting CAPTCHA statistics:', error);
      return {
        generated: 0,
        solved: 0,
        failed: 0,
        expired: 0,
        solveRate: 0
      };
    }
  }
  
  // Get hourly statistics for monitoring
  static async getHourlyStatistics(date?: string): Promise<Record<number, {
    generated: number;
    solved: number;
    failed: number;
    expired: number;
  }>> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const hourlyStats: Record<number, any> = {};
    
    try {
      for (let hour = 0; hour < 24; hour++) {
        const [generated, solved, failed, expired] = await Promise.all([
          redisClient.get(`${this.STATS_PREFIX}${targetDate}:${hour}:generated`),
          redisClient.get(`${this.STATS_PREFIX}${targetDate}:${hour}:solved`),
          redisClient.get(`${this.STATS_PREFIX}${targetDate}:${hour}:failed`),
          redisClient.get(`${this.STATS_PREFIX}${targetDate}:${hour}:expired`)
        ]);
        
        hourlyStats[hour] = {
          generated: parseInt(generated || '0', 10),
          solved: parseInt(solved || '0', 10),
          failed: parseInt(failed || '0', 10),
          expired: parseInt(expired || '0', 10)
        };
      }
      
      return hourlyStats;
    } catch (error) {
      log.error('Error getting hourly CAPTCHA statistics:', error);
      return {};
    }
  }
}