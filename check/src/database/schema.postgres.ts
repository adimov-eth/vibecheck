import { pgTable, text, integer, boolean, timestamp, uuid, index, primaryKey, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enum types for PostgreSQL
export const conversationModeEnum = pgEnum('conversation_mode', ['therapy', 'coaching', 'interview', 'journal', 'conversation']);
export const recordingTypeEnum = pgEnum('recording_type', ['separate', 'live', 'microphone']);
export const conversationStatusEnum = pgEnum('conversation_status', ['waiting', 'uploading', 'transcribing', 'analyzing', 'completed', 'failed', 'processing']);
export const audioStatusEnum = pgEnum('audio_status', ['uploaded', 'processing', 'transcribed', 'failed']);

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  appAccountToken: text('app_account_token').unique(),
  // Account lockout fields
  accountLocked: boolean('account_locked').default(false),
  accountLockedAt: timestamp('account_locked_at', { withTimezone: true }),
  accountLockReason: text('account_lock_reason'),
  unlockToken: text('unlock_token'),
  unlockTokenGeneratedAt: timestamp('unlock_token_generated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    emailIdx: index('idx_users_email').on(table.email),
    appAccountTokenIdx: index('idx_users_app_account_token').on(table.appAccountToken),
    unlockTokenIdx: index('idx_users_unlock_token').on(table.unlockToken),
    createdAtIdx: index('idx_users_created_at').on(table.createdAt),
  };
});

// Conversations table
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mode: conversationModeEnum('mode').notNull(),
  recordingType: recordingTypeEnum('recording_type').notNull(),
  status: conversationStatusEnum('status').notNull().default('waiting'),
  gptResponse: text('gpt_response'),
  errorMessage: text('error_message'),
  duration: integer('duration'), // seconds
  transcript: text('transcript'),
  analysis: text('analysis'), // JSON string, could be jsonb in future
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('idx_conversations_user_id').on(table.userId),
    statusIdx: index('idx_conversations_status').on(table.status),
    createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
    userCreatedIdx: index('idx_conversations_user_created').on(table.userId, table.createdAt),
  };
});

// Audios table
export const audios = pgTable('audios', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  audioFile: text('audio_file'),
  audioKey: text('audio_key'),
  transcription: text('transcription'),
  status: audioStatusEnum('status').notNull().default('uploaded'),
  errorMessage: text('error_message'),
  duration: integer('duration'), // seconds
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    conversationIdIdx: index('idx_audios_conversation_id').on(table.conversationId),
    userIdIdx: index('idx_audios_user_id').on(table.userId),
    statusIdx: index('idx_audios_status').on(table.status),
    conversationIdAudioKeyIdx: index('idx_audios_conversation_id_audio_key').on(table.conversationId, table.audioKey),
    audioKeyIdx: uniqueIndex('idx_audios_audio_key').on(table.audioKey),
  };
});

// Subscriptions table
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(), // Apple transaction ID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  expiresDate: timestamp('expires_date', { withTimezone: true }),
  originalTransactionId: text('original_transaction_id'),
  productId: text('product_id'),
  environment: text('environment'),
  lastRenewalDate: timestamp('last_renewal_date', { withTimezone: true }),
  autoRenewStatus: boolean('auto_renew_status'),
  gracePeriodExpiresDate: timestamp('grace_period_expires_date', { withTimezone: true }),
  cancellationDate: timestamp('cancellation_date', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  billingRetryAttempt: integer('billing_retry_attempt'),
  priceConsentStatus: integer('price_consent_status'),
  notificationType: text('notification_type'),
  notificationUUID: text('notification_uuid'),
  appleReceiptData: text('apple_receipt_data'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('idx_subscriptions_user_id').on(table.userId),
    expiresDateIdx: index('idx_subscriptions_expires_date').on(table.expiresDate),
    activeStatusIdx: index('idx_subscriptions_active_status').on(table.userId, table.isActive),
  };
});

// Sessions table (for JWT tracking) - new table for PostgreSQL
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => {
  return {
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    expiresAtIdx: index('idx_sessions_expires_at').on(table.expiresAt),
    tokenHashIdx: index('idx_sessions_token_hash').on(table.tokenHash),
  };
});

// Usage records table - new for tracking usage
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // 'conversation', 'transcription', etc.
  tokensUsed: integer('tokens_used'),
  costCents: integer('cost_cents'),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('idx_usage_records_user_id').on(table.userId),
    createdAtIdx: index('idx_usage_records_created_at').on(table.createdAt),
    userActionIdx: index('idx_usage_records_user_action').on(table.userId, table.action),
  };
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Audio = typeof audios.$inferSelect;
export type NewAudio = typeof audios.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;