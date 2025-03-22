import { PooledDatabase } from '../database';
import { conversations } from '../database/schema';
import { eq, and, gte, count } from 'drizzle-orm';
import { log } from '../utils/logger.utils';
import { hasActiveSubscription } from './subscription.service';

// Configuration for usage limits
const FREE_TIER_MONTHLY_LIMIT = 10;

/**
 * Get the start date of the current month (UTC)
 */
function getCurrentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Count conversations created by a user in the current month
 */
export async function countUserConversationsThisMonth(userId: string, db: PooledDatabase): Promise<number> {
  const monthStart = getCurrentMonthStart();
  
  // Query conversations created by the user since the start of the current month
  const result = await db
    .select({ count: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        gte(conversations.createdAt, monthStart)
      )
    );
  
  return result[0]?.count || 0;
}

/**
 * Check if a user can create a new conversation based on their subscription status and usage
 */
export async function canCreateConversation(userId: string, db: PooledDatabase): Promise<{
  canCreate: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  isSubscribed: boolean;
}> {
  try {
    // First check if user has an active subscription
    const subscriptionStatus = await hasActiveSubscription(userId, db);
    
    // If user is subscribed, they have unlimited access
    if (subscriptionStatus.isActive) {
      return {
        canCreate: true,
        currentUsage: 0, // Not relevant for subscribers
        limit: -1, // Unlimited
        isSubscribed: true
      };
    }
    
    // For free tier users, check their current usage
    const conversationCount = await countUserConversationsThisMonth(userId, db);
    const canCreate = conversationCount < FREE_TIER_MONTHLY_LIMIT;
    
    return {
      canCreate,
      reason: canCreate ? undefined : 'Monthly conversation limit reached',
      currentUsage: conversationCount,
      limit: FREE_TIER_MONTHLY_LIMIT,
      isSubscribed: false
    };
  } catch (error) {
    log(`Error checking if user can create conversation: ${error instanceof Error ? error.message : String(error)}`, 'error');
    
    // Default to allowing creation if there's an error checking limits
    // This is a business decision - could be changed to deny by default
    return {
      canCreate: true,
      reason: 'Error checking limits',
      currentUsage: 0,
      limit: FREE_TIER_MONTHLY_LIMIT,
      isSubscribed: false
    };
  }
}

/**
 * Get user's current usage stats
 */
export async function getUserUsageStats(userId: string, db: PooledDatabase): Promise<{
  currentUsage: number;
  limit: number;
  isSubscribed: boolean;
  remainingConversations: number;
  resetDate: Date;
}> {
  try {
    const subscriptionStatus = await hasActiveSubscription(userId, db);
    
    // For subscribers, return unlimited usage info
    if (subscriptionStatus.isActive) {
      return {
        currentUsage: 0,
        limit: -1, // Unlimited
        isSubscribed: true,
        remainingConversations: -1, // Unlimited
        resetDate: new Date(0) // Not applicable
      };
    }
    
    // For free tier users, calculate remaining conversations
    const conversationCount = await countUserConversationsThisMonth(userId, db);
    const remainingConversations = Math.max(0, FREE_TIER_MONTHLY_LIMIT - conversationCount);
    
    // Calculate next reset date (1st of next month)
    const now = new Date();
    const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    
    return {
      currentUsage: conversationCount,
      limit: FREE_TIER_MONTHLY_LIMIT,
      isSubscribed: false,
      remainingConversations,
      resetDate
    };
  } catch (error) {
    log(`Error getting user usage stats: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
} 