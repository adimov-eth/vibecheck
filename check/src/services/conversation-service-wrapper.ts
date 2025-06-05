// Wrapper to conditionally use Drizzle or legacy conversation service
import { shouldUseDrizzle } from '../database/drizzle';

// Dynamically import the appropriate service
const getService = async () => {
  if (shouldUseDrizzle()) {
    return import('./conversation-service-v2');
  }
  return import('./conversation-service');
};

// Export all functions with dynamic dispatch
export const createConversation = async (...args: Parameters<typeof import('./conversation-service').createConversation>) => {
  const service = await getService();
  return service.createConversation(...args);
};

export const getConversation = async (...args: Parameters<typeof import('./conversation-service').getConversation>) => {
  const service = await getService();
  return service.getConversation(...args);
};

export const getConversationById = async (...args: Parameters<typeof import('./conversation-service').getConversation>) => {
  const service = await getService();
  // Use getConversation if getConversationById doesn't exist
  return (service.getConversationById || service.getConversation)(...args);
};

export const getUserConversations = async (...args: Parameters<typeof import('./conversation-service').getUserConversations>) => {
  const service = await getService();
  return service.getUserConversations(...args);
};

export const updateConversation = async (...args: Parameters<typeof import('./conversation-service').updateConversation>) => {
  const service = await getService();
  return service.updateConversation(...args);
};

export const updateConversationStatus = async (...args: Parameters<typeof import('./conversation-service').updateConversationStatus>) => {
  const service = await getService();
  return service.updateConversationStatus(...args);
};

export const deleteConversation = async (...args: Parameters<typeof import('./conversation-service').deleteConversation>) => {
  const service = await getService();
  return service.deleteConversation(...args);
};

export const getRecentActiveUsers = async (...args: Parameters<typeof import('./conversation-service').getRecentActiveUsers>) => {
  const service = await getService();
  return service.getRecentActiveUsers(...args);
};