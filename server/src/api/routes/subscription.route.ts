import { Request, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { log } from '../../utils/logger.utils';
import { 
  verifyAndSaveSubscription,
  hasActiveSubscription
} from '../../services/subscription.service';

import {  verifyReceiptSchema, appStoreNotificationSchema} from './subscription.routes';
import router from './auth.routes';

// Define route handlers with explicit types
const verifyReceiptHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = verifyReceiptSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: validationResult.error.errors });
    }
    const { receiptData } = validationResult.data;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in request' });
    }
    log(`Verifying receipt for user: ${userId}`, 'info');
    const result = await verifyAndSaveSubscription(userId, receiptData, req.db);
    if (!result.isValid) {
      return res.status(400).json({ error: 'Invalid receipt', details: result.error || 'Receipt verification failed' });
    }
    res.status(200).json({
      success: true,
      subscription: { isValid: result.isValid, type: result.type, expiresDate: result.expiresDate },
    });
  } catch (error) {
    log(`Error in verify receipt endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
};

const checkSubscriptionStatusHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in request' });
    }
    const subscription = await hasActiveSubscription(userId, req.db);
    res.status(200).json({
      isSubscribed: subscription.isActive,
      subscription: { type: subscription.type, expiresDate: subscription.expiresDate },
    });
  } catch (error) {
    log(`Error in subscription status endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
};

const handleNotificationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    log('Received App Store notification', 'info');
    const validationResult = appStoreNotificationSchema.safeParse(req.body);
    if (!validationResult.success) {
      log(`Invalid notification format: ${JSON.stringify(validationResult.error.errors)}`, 'error');
      return res.status(400).json({ error: 'Invalid notification format', details: validationResult.error.errors });
    }
    const notification = validationResult.data;
    log(`App Store notification: ${JSON.stringify(notification)}`, 'info');
    res.status(200).json({ success: true });
  } catch (error) {
    log(`Error in App Store notifications endpoint: ${error instanceof Error ? error.message : String(error)}`, 'error');
    next(error);
  }
};

// Register routes with typed handlers
router.post('/verify', authMiddleware as RequestHandler, verifyReceiptHandler as RequestHandler);
router.get('/status', authMiddleware as RequestHandler, checkSubscriptionStatusHandler as RequestHandler);
router.post('/notifications', handleNotificationsHandler as RequestHandler); 