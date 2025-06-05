// Service exports with Drizzle support
// This file acts as a router between legacy and Drizzle implementations

import { shouldUseDrizzle } from '../database/drizzle';

// Core services
export * from './user-cache-service';
export * from './session-service';
export * from './audio-service';
export * from './subscription-serivice';
export * from './usage-service';
export * from './notification-service';

// Cache services
export * from './cache';

// Conditionally export the appropriate user service
let userServiceModule: any;
if (shouldUseDrizzle()) {
  userServiceModule = await import('./user-service-v2');
} else {
  userServiceModule = await import('./user-service');
}

export const {
  getUser,
  upsertUser,
  findUserByEmail,
  findUserByAppleAccountToken,
  createUserWithAppleSignIn,
  deleteUser
} = userServiceModule;

// Conditionally export the appropriate conversation service
let conversationServiceModule: any;
if (shouldUseDrizzle()) {
  conversationServiceModule = await import('./conversation-service-v2');
} else {
  conversationServiceModule = await import('./conversation-service');
}

export const {
  createConversation,
  getConversation,
  getUserConversations,
  updateConversation,
  deleteConversation,
  getRecentActiveUsers
} = conversationServiceModule;