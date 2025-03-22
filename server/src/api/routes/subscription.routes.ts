import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  verifyAndSaveSubscription,
  hasActiveSubscription
} from '../../services/subscription.service';
import { log } from '../../utils/logger.utils';
import { z } from 'zod';

const router = express.Router();

// Schema validation for receipt verification request
export const verifyReceiptSchema = z.object({
  receiptData: z.string().min(1, "Receipt data is required"),
});

// Schema for notification body from App Store Server Notifications
export const appStoreNotificationSchema = z.object({
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
  authMiddleware as RequestHandler,
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      
      const result = await verifyAndSaveSubscription(userId, receiptData, req.db);
      
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
  }) as RequestHandler
);

/**
 * Check subscription status
 * GET /subscriptions/status
 */
router.get(
  '/status',
  authMiddleware as RequestHandler,
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID not found in request' });
      }
      
      const subscription = await hasActiveSubscription(userId, req.db);
      
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
  }) as RequestHandler
);

/**
 * Handle App Store Server Notifications
 * POST /subscriptions/notifications
 */
router.post(
  '/notifications', 
  (async (req: Request, res: Response, next: NextFunction) => {
    try {
      log('Received App Store notification', 'info');
      
      const validationResult = appStoreNotificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        log(`Invalid notification format: ${JSON.stringify(validationResult.error.errors)}`, 'error');
        return res.status(400).json({ 
          error: 'Invalid notification format', 
          details: validationResult.error.errors 
        });
      }
      
      const notification = validationResult.data;
      
      log(`App Store notification: ${JSON.stringify(notification)}`, 'info');
      
      res.status(200).json({ success: true });
    } catch (error) {
      log(`Error in App Store notifications endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
      next(error);
    }
  }) as RequestHandler
);

export default router;