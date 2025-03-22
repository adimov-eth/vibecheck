import { PooledDatabase } from '../database';
import { subscriptions } from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { log } from '../utils/logger.utils';
// Use require syntax for CommonJS module
// @ts-ignore
const appleReceiptVerify = require('node-apple-receipt-verify');
import { config } from '../config';

// Mapping for human-readable subscription types
const PRODUCT_ID_MAP = {
  'com.vibecheck.subscription.monthly': 'monthly',
  'com.vibecheck.subscription.yearly': 'yearly',
};

export interface VerificationResult {
  isValid: boolean;
  expiresDate: Date | null;
  environment: string;
  productId: string | null;
  type: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchaseDate: Date | null;
  error?: string;
}

/**
 * Verify Apple receipt data and return validation result
 */
export async function verifyAppleReceipt(
  receiptData: string,
  excludeSandbox = false
): Promise<VerificationResult> {
  try {
    log('Verifying Apple receipt...', 'info');
    
    // Configure verification settings
    const options = {
      receipt: receiptData,
      secret: config.appleSharedSecret || '', // Optional shared secret if configured
      excludeSandbox, // Exclude sandbox environment in production
    };
    
    // Verify receipt using Apple's servers
    const result = await appleReceiptVerify.validate(options);
    log(`Receipt verification status: ${result.status}`, 'info');

    // Handle failed verification
    if (result.status !== 0) {
      return {
        isValid: false,
        expiresDate: null,
        environment: result.environment || 'unknown',
        productId: null,
        type: null,
        transactionId: null,
        originalTransactionId: null,
        purchaseDate: null,
        error: `Receipt verification failed with status ${result.status}`
      };
    }
    
    // Get the latest subscription receipt
    const latestReceipt = result.latest_receipt_info?.[0];
    if (!latestReceipt) {
      return {
        isValid: false,
        expiresDate: null,
        environment: result.environment || 'unknown',
        productId: null,
        type: null,
        transactionId: null,
        originalTransactionId: null,
        purchaseDate: null,
        error: 'No subscription receipt found'
      };
    }
    
    // Extract expiration date (in milliseconds)
    const expiresDateMs = Number(latestReceipt.expires_date_ms);
    const purchaseDateMs = Number(latestReceipt.purchase_date_ms);
    const productId = latestReceipt.product_id;
    const transactionId = latestReceipt.transaction_id;
    const originalTransactionId = latestReceipt.original_transaction_id;
    
    // Convert to Date objects
    const expiresDate = isNaN(expiresDateMs) ? null : new Date(expiresDateMs);
    const purchaseDate = isNaN(purchaseDateMs) ? null : new Date(purchaseDateMs);
    
    // Determine if subscription is still valid
    const isValid = expiresDate ? expiresDate > new Date() : false;
    
    // Get subscription type from product ID
    const type = productId && PRODUCT_ID_MAP[productId as keyof typeof PRODUCT_ID_MAP] || null;
    
    return {
      isValid,
      expiresDate,
      environment: result.environment,
      productId,
      type,
      transactionId,
      originalTransactionId,
      purchaseDate,
    };
  } catch (error) {
    log(`Receipt verification error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      isValid: false,
      expiresDate: null,
      environment: 'unknown',
      productId: null,
      type: null,
      transactionId: null,
      originalTransactionId: null,
      purchaseDate: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Save a verified subscription to the database
 */
export async function saveSubscription(
  userId: string,
  receiptData: string,
  verificationResult: VerificationResult,
  db: PooledDatabase
): Promise<number> {
  try {
    const now = new Date();
    
    // Prepare subscription data
    const subscriptionData = {
      userId,
      productId: verificationResult.productId || 'unknown',
      type: verificationResult.type || 'unknown',
      originalTransactionId: verificationResult.originalTransactionId || 'unknown',
      transactionId: verificationResult.transactionId || 'unknown',
      receiptData,
      environment: verificationResult.environment || 'unknown',
      isActive: verificationResult.isValid,
      expiresDate: verificationResult.expiresDate,
      purchaseDate: verificationResult.purchaseDate || now,
      lastVerifiedDate: now,
      createdAt: now,
      updatedAt: now,
    };
    
    // Check if this transaction already exists
    if (verificationResult.transactionId) {
      const existingSubscription = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.transactionId, verificationResult.transactionId))
        .limit(1);
        
      if (existingSubscription.length > 0) {
        // Update the existing subscription
        await db
          .update(subscriptions)
          .set({
            isActive: verificationResult.isValid,
            expiresDate: verificationResult.expiresDate,
            lastVerifiedDate: now,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, existingSubscription[0].id));
          
        return existingSubscription[0].id;
      }
    }
    
    // Insert a new subscription record
    const result = await db
      .insert(subscriptions)
      .values(subscriptionData)
      .returning({ id: subscriptions.id });
      
    return result[0].id;
  } catch (error) {
    log(`Error checking subscription status: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Check if a user has an active subscription
 */
export async function hasActiveSubscription(userId: string, db: PooledDatabase): Promise<{
  isActive: boolean;
  expiresDate: Date | null;
  type: string | null;
  subscriptionId: number | null;
}> {
  try {
    // Find the most recent active subscription
    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.isActive, true)
        )
      )
      .orderBy(desc(subscriptions.lastVerifiedDate))
      .limit(1);
      
    if (activeSubscriptions.length === 0) {
      return {
        isActive: false,
        expiresDate: null,
        type: null,
        subscriptionId: null
      };
    }
    
    const subscription = activeSubscriptions[0];
    
    // Check if the subscription has expired since last verification
    if (subscription.expiresDate && new Date(subscription.expiresDate) < new Date()) {
      // Update subscription to inactive
      await db
        .update(subscriptions)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(subscriptions.id, subscription.id));
        
      return {
        isActive: false,
        expiresDate: subscription.expiresDate ? new Date(subscription.expiresDate) : null,
        type: subscription.type,
        subscriptionId: subscription.id
      };
    }
    
    return {
      isActive: true,
      expiresDate: subscription.expiresDate ? new Date(subscription.expiresDate) : null,
      type: subscription.type,
      subscriptionId: subscription.id
    };
  } catch (error) {
    log(`Error checking subscription status: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * Verify a receipt and save/update subscription information
 */
export async function verifyAndSaveSubscription(
  userId: string,
  receiptData: string,
  db: PooledDatabase
): Promise<{
  isValid: boolean;
  expiresDate: Date | null;
  type: string | null;
  error?: string;
}> {
  try {
    // Verify the receipt with Apple
    const verificationResult = await verifyAppleReceipt(receiptData);
    
    if (!verificationResult.isValid) {
      return {
        isValid: false,
        expiresDate: null,
        type: null,
        error: verificationResult.error || 'Invalid receipt'
      };
    }
    
    // Save/update subscription in the database
    await saveSubscription(userId, receiptData, verificationResult, db);
    
    return {
      isValid: verificationResult.isValid,
      expiresDate: verificationResult.expiresDate,
      type: verificationResult.type
    };
  } catch (error) {
    log(`Error in verify and save subscription: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      isValid: false,
      expiresDate: null,
      type: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 