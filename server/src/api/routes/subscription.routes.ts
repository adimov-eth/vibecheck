import express, { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  verifyAndSaveSubscription,
  hasActiveSubscription
} from '../../services/subscription.service';
import { log } from '../../utils/logger.utils';
import { z } from 'zod';

const router = express.Router();

// Schema validation for receipt verification request
const verifyReceiptSchema = z.object({
  receiptData: z.string().min(1, "Receipt data is required"),
});

// Schema for notification body from App Store Server Notifications
const appStoreNotificationSchema = z.object({
  notificationType: z.string(),
  notificationUUID: z.string(),
  data: z.object({
    signedTransactionInfo: z.string().optional(),
    signedRenewalInfo: z.string().optional(),
    environment: z.string().optional(),
  }),
});

/**
 * Verify a receipt and register a subscription
 * POST /subscriptions/verify
 */
router.post(
  '/verify', 
  authMiddleware, 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validationResult = verifyReceiptSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          details: validationResult.error.errors 
        });
      }
      
      const { receiptData } = validationResult.data;
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in request' });
      }
      
      log(`Verifying receipt for user: ${userId}`, 'info');
      
      // Verify the receipt and save subscription
      const result = await verifyAndSaveSubscription(userId, receiptData);
      
      if (!result.isValid) {
        return res.status(400).json({
          error: 'Invalid receipt',
          details: result.error || 'Receipt verification failed'
        });
      }
      
      res.status(200).json({
        success: true,
        subscription: {
          isValid: result.isValid,
          type: result.type,
          expiresDate: result.expiresDate
        }
      });
    } catch (error) {
      log(`Error in verify receipt endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }
);

/**
 * Check subscription status
 * GET /subscriptions/status
 */
router.get(
  '/status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in request' });
      }
      
      // Check if user has an active subscription
      const subscription = await hasActiveSubscription(userId);
      
      res.status(200).json({
        isSubscribed: subscription.isActive,
        subscription: {
          type: subscription.type,
          expiresDate: subscription.expiresDate
        }
      });
    } catch (error) {
      log(`Error in subscription status endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }
);

/**
 * Handle App Store Server Notifications
 * POST /subscriptions/notifications
 * This endpoint doesn't require authentication as it's called by Apple's servers
 */
router.post(
  '/notifications',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      log('Received App Store notification', 'info');
      
      // Validate notification format
      const validationResult = appStoreNotificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        log(`Invalid notification format: ${JSON.stringify(validationResult.error.errors)}`, 'error');
        return res.status(400).json({ 
          error: 'Invalid notification format', 
          details: validationResult.error.errors 
        });
      }
      
      const notification = validationResult.data;
      
      // Log the notification for debugging/monitoring
      log(`App Store notification: ${JSON.stringify(notification)}`, 'info');
      
      // For now, we just acknowledge receipt of the notification
      // In a production environment, you would process these notifications
      // to update subscription status based on renewal, expiration, etc.
      
      res.status(200).json({ success: true });
    } catch (error) {
      log(`Error in App Store notifications endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }
);

export default router; 