import { websocketManager } from './websocket.utils.js';
import { logger } from './logger.utils.js';
import { config } from '../config.js';

/**
 * Notification types for WebSocket messages
 */
export enum NotificationType {
  CONVERSATION_STARTED = 'conversation_started',
  CONVERSATION_COMPLETED = 'conversation_completed',
  CONVERSATION_PROGRESS = 'conversation_progress',
  CONVERSATION_ERROR = 'conversation_error',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  USAGE_UPDATED = 'usage_updated',
  USER_UPDATED = 'user_updated',
}

/**
 * Send a notification about conversation progress or status
 * @param userId The user ID to send the notification to
 * @param conversationId The conversation ID
 * @param type The notification type
 * @param data Additional data to include in the notification
 */
export function sendConversationNotification(
  userId: string,
  conversationId: string, 
  type: NotificationType,
  data: any = {}
) {
  if (!config.webSocket.enabled) {
    return;
  }

  try {
    // Send to the specific user
    websocketManager.sendToUser(userId, {
      type,
      payload: {
        conversationId,
        timestamp: new Date().toISOString(),
        ...data
      }
    });

    // Also send to anyone subscribed to this conversation
    websocketManager.sendToConversation(conversationId, {
      type,
      payload: {
        conversationId,
        timestamp: new Date().toISOString(),
        ...data
      }
    });

    logger.debug(`Sent ${type} notification for conversation ${conversationId} to user ${userId}`);
  } catch (error) {
    logger.error(`Failed to send notification for conversation ${conversationId}:`, error);
  }
}

/**
 * Send a notification about user or subscription updates
 * @param userId The user ID to send the notification to
 * @param type The notification type
 * @param data Additional data to include in the notification
 */
export function sendUserNotification(
  userId: string, 
  type: NotificationType,
  data: any = {}
) {
  if (!config.webSocket.enabled) {
    return;
  }

  try {
    websocketManager.sendToUser(userId, {
      type,
      payload: {
        timestamp: new Date().toISOString(),
        ...data
      }
    });
    
    logger.debug(`Sent ${type} notification to user ${userId}`);
  } catch (error) {
    logger.error(`Failed to send ${type} notification to user ${userId}:`, error);
  }
}