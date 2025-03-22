import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  mode: text('mode').notNull(), // "mediator", "counselor", "dinner", "movie"
  recordingType: text('recording_type').notNull(), // "separate" or "live"
  status: text('status').notNull().default('waiting'),
  gptResponse: text('gpt_response'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const audios = sqliteTable('audios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  userId: text('user_id').notNull(),
  audioFile: text('audio_file'),
  transcription: text('transcription'),
  status: text('status').notNull().default('uploaded'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Table for storing user subscription information
export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
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
});
