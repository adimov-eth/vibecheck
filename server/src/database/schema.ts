import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
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
