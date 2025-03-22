import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// User table for storing basic user information
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  emailIdx: index('email_idx').on(table.email)
}));

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  mode: text('mode').notNull(), // "mediator", "counselor", "dinner", "movie"
  recordingType: text('recording_type').notNull(), // "separate" or "live"
  status: text('status').notNull().default('waiting'),
  gptResponse: text('gpt_response'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  // Index for faster queries by user
  userIdIdx: index('conversation_user_id_idx').on(table.userId),
  // Compound index for status filtering by user
  userStatusIdx: index('conversation_user_status_idx').on(table.userId, table.status),
  // Index for filtering by creation date (for cleanup jobs)
  createdAtIdx: index('conversation_created_at_idx').on(table.createdAt)
}));

export const audios = sqliteTable('audios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  userId: text('user_id').notNull().references(() => users.id),
  audioFile: text('audio_file'),
  transcription: text('transcription'),
  status: text('status').notNull().default('uploaded'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  // Index for finding all audios for a conversation
  conversationIdIdx: index('audio_conversation_id_idx').on(table.conversationId),
  // Index for finding all audios by user
  userIdIdx: index('audio_user_id_idx').on(table.userId),
  // Index for status queries (processing jobs)
  statusIdx: index('audio_status_idx').on(table.status)
}));

// Table for storing user subscription information
export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  productId: text('product_id').notNull(), // e.g., 'com.vibecheck.subscription.monthly'
  type: text('type').notNull(), // 'monthly', 'yearly'
  originalTransactionId: text('original_transaction_id').notNull(),
  transactionId: text('transaction_id').notNull(),
  receiptData: text('receipt_data').notNull(), // Base64 encoded receipt
  environment: text('environment').notNull(), // 'Production', 'Sandbox'
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  expiresDate: integer('expires_date', { mode: 'timestamp' }),
  purchaseDate: integer('purchase_date', { mode: 'timestamp' }).notNull(),
  lastVerifiedDate: integer('last_verified_date', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  // Index for checking if a user has active subscriptions
  userIdIdx: index('subscription_user_id_idx').on(table.userId),
  // Index for active subscription queries
  activeIdx: index('subscription_active_idx').on(table.isActive),
  // Compound index for getting active subscriptions by user
  userActiveIdx: index('subscription_user_active_idx').on(table.userId, table.isActive),
  // Index for expiration jobs
  expiresDateIdx: index('subscription_expires_date_idx').on(table.expiresDate)
}));
