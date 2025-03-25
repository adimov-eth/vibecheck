// src/services/notification-service.ts
import { logger } from '@/utils/logger';
import { websocketManager } from '@/utils/websocket';

export const sendTranscriptNotification = (
  userId: string,
  conversationId: string,
  content: string
): void => {
  const topic = `conversation:${conversationId}`;
  websocketManager.sendToSubscribedClients(userId, topic, {
    type: 'transcript',
    timestamp: new Date().toISOString(),
    payload: { conversationId, content },
  });
  logger.debug(`Sent transcript for conversation ${conversationId} to user ${userId}`);
};

export const sendAnalysisNotification = (
  userId: string,
  conversationId: string,
  content: string
): void => {
  const topic = `conversation:${conversationId}`;
  websocketManager.sendToSubscribedClients(userId, topic, {
    type: 'analysis',
    timestamp: new Date().toISOString(),
    payload: { conversationId, content },
  });
  logger.debug(`Sent analysis for conversation ${conversationId} to user ${userId}`);
};

export const sendStatusNotification = (
  userId: string,
  conversationId: string,
  status: 'processing' | 'completed' | 'error',
  error?: string
): void => {
  const topic = `conversation:${conversationId}`;
  websocketManager.sendToSubscribedClients(userId, topic, {
    type: 'status',
    timestamp: new Date().toISOString(),
    payload: { conversationId, status, ...(error && { error }) },
  });
  logger.debug(`Sent status ${status} for conversation ${conversationId} to user ${userId}`);
};

export const sendConversationNotification = (
  userId: string,
  conversationId: string,
  status: 'conversation_started' | 'conversation_completed',
  payload?: Record<string, unknown>
): void => {
  const topic = `conversation:${conversationId}`;
  
  // For 'conversation_completed', ensure we're using a consistent message format
  // that the client can easily parse
  if (status === 'conversation_completed') {
    websocketManager.sendToSubscribedClients(userId, topic, {
      type: 'status',
      timestamp: new Date().toISOString(),
      payload: { 
        conversationId, 
        status, 
        // Make sure gptResponse is directly accessible in the payload
        gptResponse: payload?.gptResponse || null,
        ...payload 
      },
    });
    
    // Also send an explicit analysis message for better client compatibility
    if (payload?.gptResponse) {
      websocketManager.sendToSubscribedClients(userId, topic, {
        type: 'analysis',
        timestamp: new Date().toISOString(),
        payload: { 
          conversationId, 
          content: payload.gptResponse as string 
        },
      });
    }
  } else {
    websocketManager.sendToSubscribedClients(userId, topic, {
      type: 'status',
      timestamp: new Date().toISOString(),
      payload: { conversationId, status, ...payload },
    });
  }

  logger.debug(`Sent conversation notification ${status} for ${conversationId} to user ${userId}`);
};

export const sendAudioNotification = (
  userId: string,
  audioId: string,
  conversationId: string,
  status: 'processing' | 'transcribed' | 'failed'
): void => {
  const topic = `conversation:${conversationId}`;
  websocketManager.sendToSubscribedClients(userId, topic, {
    type: 'audio',
    timestamp: new Date().toISOString(),
    payload: { audioId, status },
  });
};
