/**
 * Centralized API endpoint definitions for the VibeCheck app
 * 
 * All API endpoints are defined here to ensure consistency and easy maintenance.
 * When server API changes, only this file needs to be updated.
 */

export const API_ENDPOINTS = {
  // Authentication
  AUTH_USER: '/auth/user',
  
  // Conversations
  CONVERSATIONS: '/conversations',
  CONVERSATION_STATUS: (conversationId: string) => `/conversations/${conversationId}`,
  CONVERSATION_RESULT: (conversationId: string) => `/conversations/${conversationId}/result`,
  
  // Audio
  AUDIO_UPLOAD: '/audio',
  
  // Subscriptions
  SUBSCRIPTION_VERIFY: '/subscriptions/verify',
  SUBSCRIPTION_STATUS: '/subscriptions/status',
  SUBSCRIPTION_NOTIFICATIONS: '/subscriptions/notifications',
  
  // Usage
  USAGE_STATS: '/usage/stats',
  
  // Users
  USER_PROFILE: '/users/me',
  USERS: '/users', // Admin only
};

// API base URL - consider moving to environment config
export const API_BASE_URL = 'https://v.bkk.lol';

// WebSocket endpoint
export const WS_ENDPOINT = 'wss://v.bkk.lol/ws'; 