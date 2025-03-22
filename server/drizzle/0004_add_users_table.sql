-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

-- Recreate the subscriptions table with proper foreign key constraints
DROP TABLE IF EXISTS "subscriptions";
CREATE TABLE "subscriptions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "original_transaction_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "receipt_data" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "is_active" INTEGER NOT NULL,
  "expires_date" INTEGER,
  "purchase_date" INTEGER NOT NULL,
  "last_verified_date" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Add foreign key constraints to existing tables
-- First, ensure the tables have the right structure
PRAGMA foreign_keys = OFF;

-- Add foreign key constraints to conversations
CREATE TABLE IF NOT EXISTS "conversations_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "recording_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "gpt_response" TEXT,
  "error_message" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Transfer data from conversations to conversations_new
INSERT INTO "conversations_new" 
SELECT * FROM "conversations";

-- Drop old table and rename new one
DROP TABLE "conversations";
ALTER TABLE "conversations_new" RENAME TO "conversations";

-- Add foreign key constraints to audios
CREATE TABLE IF NOT EXISTS "audios_new" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "audio_file" TEXT,
  "transcription" TEXT,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "error_message" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Transfer data from audios to audios_new
INSERT INTO "audios_new"
SELECT * FROM "audios";

-- Drop old table and rename new one
DROP TABLE "audios";
ALTER TABLE "audios_new" RENAME TO "audios";

PRAGMA foreign_keys = ON;