import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  appAccountToken: text('appAccountToken').unique(),
  // Account lockout fields
  accountLocked: integer('accountLocked', { mode: 'boolean' }).default(false),
  accountLockedAt: integer('accountLockedAt'),
  accountLockReason: text('accountLockReason'),
  unlockToken: text('unlockToken'),
  unlockTokenGeneratedAt: integer('unlockTokenGeneratedAt'),
  createdAt: integer('createdAt').notNull().default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updatedAt').notNull().default(sql`strftime('%s', 'now')`),
}, (table) => {
  return {
    emailIdx: index('idx_users_email').on(table.email),
    appAccountTokenIdx: index('idx_users_appAccountToken').on(table.appAccountToken),
    unlockTokenIdx: index('idx_users_unlockToken').on(table.unlockToken),
  };
});

// Conversations table
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id),
  mode: text('mode').notNull(),
  recordingType: text('recordingType').notNull(),
  status: text('status').notNull().default('waiting'),
  gptResponse: text('gptResponse'),
  errorMessage: text('errorMessage'),
  createdAt: integer('createdAt').notNull().default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updatedAt').notNull().default(sql`strftime('%s', 'now')`),
}, (table) => {
  return {
    userIdIdx: index('idx_conversations_userId').on(table.userId),
    statusIdx: index('idx_conversations_status').on(table.status),
  };
});

// Audios table
export const audios = sqliteTable('audios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversationId').notNull().references(() => conversations.id),
  userId: text('userId').notNull().references(() => users.id),
  audioFile: text('audioFile'),
  audioKey: text('audioKey'),
  transcription: text('transcription'),
  status: text('status').notNull().default('uploaded'),
  errorMessage: text('errorMessage'),
  createdAt: integer('createdAt').notNull().default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updatedAt').notNull().default(sql`strftime('%s', 'now')`),
}, (table) => {
  return {
    conversationIdIdx: index('idx_audios_conversationId').on(table.conversationId),
    userIdIdx: index('idx_audios_userId').on(table.userId),
    statusIdx: index('idx_audios_status').on(table.status),
    conversationIdAudioKeyIdx: index('idx_audios_conversationId_audioKey').on(table.conversationId, table.audioKey),
  };
});

// Subscriptions table
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id),
  isActive: integer('isActive').notNull().default(1),
  expiresDate: integer('expiresDate'),
  originalTransactionId: text('originalTransactionId'),
  productId: text('productId'),
  environment: text('environment'),
  lastRenewalDate: integer('lastRenewalDate'),
  autoRenewStatus: integer('autoRenewStatus'),
  gracePeriodExpiresDate: integer('gracePeriodExpiresDate'),
  cancellationDate: integer('cancellationDate'),
  cancellationReason: text('cancellationReason'),
  billingRetryAttempt: integer('billingRetryAttempt'),
  priceConsentStatus: integer('priceConsentStatus'),
  notificationType: text('notificationType'),
  notificationUUID: text('notificationUUID'),
  createdAt: integer('createdAt').notNull().default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updatedAt').notNull().default(sql`strftime('%s', 'now')`),
}, (table) => {
  return {
    userIdIdx: index('idx_subscriptions_userId').on(table.userId),
  };
});

// Note: Sessions and Notifications tables don't exist in the current schema

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Audio = typeof audios.$inferSelect;
export type NewAudio = typeof audios.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;