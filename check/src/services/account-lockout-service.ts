import { rateLimitConfig } from '@/config/rate-limits';
import { log } from '@/utils/logger';
import { FailedLoginService } from './failed-login-service';
import { DatabaseAdapter } from '@/database/adapter';
import { NotificationService } from './notification-service';
import crypto from 'crypto';

export interface AccountLockoutInfo {
  email: string;
  lockedAt: Date;
  reason: string;
  unlockToken?: string;
  failedAttempts: number;
}

export class AccountLockoutService {
  // Check if account should be locked and lock it if necessary
  static async checkAndLockAccount(email: string): Promise<boolean> {
    try {
      // Get failure count for this email
      const failureCount = await FailedLoginService.getFailureCount(email.toLowerCase(), 'email');
      
      if (failureCount >= rateLimitConfig.auth.maxAttempts.beforeLockout) {
        // Lock the account
        await this.lockAccount(email);
        return true;
      }
      
      return false;
    } catch (error) {
      log.error('Error checking account lockout:', error);
      return false;
    }
  }
  
  // Lock an account
  static async lockAccount(email: string, reason: string = 'Too many failed login attempts'): Promise<void> {
    try {
      const user = await DatabaseAdapter.getUserByEmail(email);
      
      if (!user) {
        log.warn('Attempted to lock non-existent account:', email);
        return;
      }
      
      // Generate unlock token
      const unlockToken = crypto.randomBytes(32).toString('hex');
      
      // Store lockout info with user
      await DatabaseAdapter.updateUser(user.id, {
        accountLocked: true,
        accountLockedAt: new Date(),
        accountLockReason: reason,
        unlockToken
      });
      
      // Send security notification email
      await this.sendLockoutNotification(user.email, unlockToken);
      
      log.warn('Account locked', { email, reason });
    } catch (error) {
      log.error('Error locking account:', error);
      throw error;
    }
  }
  
  // Check if an account is locked
  static async isAccountLocked(email: string): Promise<boolean> {
    try {
      const user = await DatabaseAdapter.getUserByEmail(email);
      
      if (!user) {
        return false;
      }
      
      return user.accountLocked === true;
    } catch (error) {
      log.error('Error checking account lock status:', error);
      return false;
    }
  }
  
  // Get account lockout information
  static async getAccountLockInfo(email: string): Promise<AccountLockoutInfo | null> {
    try {
      const user = await DatabaseAdapter.getUserByEmail(email);
      
      if (!user || !user.accountLocked) {
        return null;
      }
      
      const failureCount = await FailedLoginService.getFailureCount(email.toLowerCase(), 'email');
      
      return {
        email: user.email,
        lockedAt: user.accountLockedAt || new Date(),
        reason: user.accountLockReason || 'Security lockout',
        unlockToken: user.unlockToken,
        failedAttempts: failureCount
      };
    } catch (error) {
      log.error('Error getting account lock info:', error);
      return null;
    }
  }
  
  // Initiate account unlock process
  static async initiateUnlockProcess(email: string): Promise<void> {
    try {
      const user = await DatabaseAdapter.getUserByEmail(email);
      
      if (!user || !user.accountLocked) {
        throw new Error('Account is not locked');
      }
      
      // Generate new unlock token
      const unlockToken = crypto.randomBytes(32).toString('hex');
      
      // Update user with new unlock token
      await DatabaseAdapter.updateUser(user.id, {
        unlockToken,
        unlockTokenGeneratedAt: new Date()
      });
      
      // Send unlock email
      await this.sendUnlockEmail(user.email, unlockToken);
      
      log.info('Account unlock process initiated', { email });
    } catch (error) {
      log.error('Error initiating unlock process:', error);
      throw error;
    }
  }
  
  // Verify and unlock account
  static async verifyAndUnlockAccount(token: string): Promise<boolean> {
    try {
      // Find user by unlock token
      const user = await DatabaseAdapter.getUserByUnlockToken(token);
      
      if (!user) {
        log.warn('Invalid unlock token attempted');
        return false;
      }
      
      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - (user.unlockTokenGeneratedAt?.getTime() || 0);
      if (tokenAge > 24 * 60 * 60 * 1000) {
        log.warn('Expired unlock token attempted', { email: user.email });
        return false;
      }
      
      // Unlock the account
      await DatabaseAdapter.updateUser(user.id, {
        accountLocked: false,
        accountLockedAt: null,
        accountLockReason: null,
        unlockToken: null,
        unlockTokenGeneratedAt: null
      });
      
      // Reset failed login attempts
      await FailedLoginService.resetFailedAttempts(user.email);
      
      // Send confirmation email
      await this.sendUnlockConfirmationEmail(user.email);
      
      log.info('Account unlocked successfully', { email: user.email });
      
      return true;
    } catch (error) {
      log.error('Error verifying unlock token:', error);
      return false;
    }
  }
  
  // Admin override to unlock account
  static async adminUnlockAccount(email: string, adminId: string): Promise<void> {
    try {
      const user = await DatabaseAdapter.getUserByEmail(email);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Unlock the account
      await DatabaseAdapter.updateUser(user.id, {
        accountLocked: false,
        accountLockedAt: null,
        accountLockReason: null,
        unlockToken: null,
        unlockTokenGeneratedAt: null
      });
      
      // Reset failed login attempts
      await FailedLoginService.resetFailedAttempts(email);
      
      // Log admin action
      log.info('Account unlocked by admin', { email, adminId });
      
      // Send notification to user
      await this.sendAdminUnlockNotificationEmail(email);
    } catch (error) {
      log.error('Error in admin unlock:', error);
      throw error;
    }
  }
  
  // Send lockout notification email
  private static async sendLockoutNotification(email: string, unlockToken: string): Promise<void> {
    try {
      await NotificationService.sendEmail({
        to: email,
        subject: 'Your VibeCheck account has been locked',
        html: `
          <h2>Account Security Alert</h2>
          <p>Your VibeCheck account has been temporarily locked due to multiple failed login attempts.</p>
          <p>If this was you, you can unlock your account by clicking the link below:</p>
          <p><a href="${process.env.APP_URL}/unlock-account?token=${unlockToken}">Unlock My Account</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not attempt to log in, please contact our support team immediately.</p>
          <p>Best regards,<br>The VibeCheck Security Team</p>
        `
      });
    } catch (error) {
      log.error('Error sending lockout notification:', error);
    }
  }
  
  // Send unlock email
  private static async sendUnlockEmail(email: string, unlockToken: string): Promise<void> {
    try {
      await NotificationService.sendEmail({
        to: email,
        subject: 'Unlock your VibeCheck account',
        html: `
          <h2>Account Unlock Request</h2>
          <p>We received a request to unlock your VibeCheck account.</p>
          <p>Click the link below to unlock your account:</p>
          <p><a href="${process.env.APP_URL}/unlock-account?token=${unlockToken}">Unlock My Account</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not request this, please ignore this email.</p>
          <p>Best regards,<br>The VibeCheck Security Team</p>
        `
      });
    } catch (error) {
      log.error('Error sending unlock email:', error);
    }
  }
  
  // Send unlock confirmation email
  private static async sendUnlockConfirmationEmail(email: string): Promise<void> {
    try {
      await NotificationService.sendEmail({
        to: email,
        subject: 'Your VibeCheck account has been unlocked',
        html: `
          <h2>Account Unlocked</h2>
          <p>Your VibeCheck account has been successfully unlocked.</p>
          <p>You can now log in with your credentials.</p>
          <p>For your security, we recommend:</p>
          <ul>
            <li>Using a strong, unique password</li>
            <li>Enabling two-factor authentication</li>
            <li>Being cautious of phishing attempts</li>
          </ul>
          <p>Best regards,<br>The VibeCheck Security Team</p>
        `
      });
    } catch (error) {
      log.error('Error sending unlock confirmation:', error);
    }
  }
  
  // Send admin unlock notification email
  private static async sendAdminUnlockNotificationEmail(email: string): Promise<void> {
    try {
      await NotificationService.sendEmail({
        to: email,
        subject: 'Your VibeCheck account has been unlocked by an administrator',
        html: `
          <h2>Account Unlocked by Administrator</h2>
          <p>Your VibeCheck account has been unlocked by our support team.</p>
          <p>You can now log in with your credentials.</p>
          <p>If you have any questions or concerns, please contact our support team.</p>
          <p>Best regards,<br>The VibeCheck Support Team</p>
        `
      });
    } catch (error) {
      log.error('Error sending admin unlock notification:', error);
    }
  }
}