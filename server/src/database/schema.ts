import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk user ID
    email: text('email'),
    name: text('name'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => [
    index('email_idx').on(table.email)
  ]
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    recordingType: text('recording_type').notNull(),
    status: text('status').notNull().default('waiting'),
    gptResponse: text('gpt_response'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => [
    index('conversation_user_id_idx').on(table.userId),
    index('conversation_user_status_idx').on(table.userId, table.status),
    index('conversation_created_at_idx').on(table.createdAt)
  ]
);

export const audios = sqliteTable(
  'audios',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    audioFile: text('audio_file'),
    transcription: text('transcription'),
    status: text('status').notNull().default('uploaded'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => [
    index('audio_conversation_id_idx').on(table.conversationId),
    index('audio_user_id_idx').on(table.userId),
    index('audio_status_idx').on(table.status)
  ]
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    type: text('type').notNull(),
    originalTransactionId: text('original_transaction_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    receiptData: text('receipt_data').notNull(),
    environment: text('environment').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    expiresDate: integer('expires_date', { mode: 'timestamp' }),
    purchaseDate: integer('purchase_date', { mode: 'timestamp' }).notNull(),
    lastVerifiedDate: integer('last_verified_date', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
  },
  (table) => [
    index('subscription_user_id_idx').on(table.userId),
    index('subscription_active_idx').on(table.isActive),
    index('subscription_user_active_idx').on(table.userId, table.isActive),
    index('subscription_expires_date_idx').on(table.expiresDate)
  ]
);