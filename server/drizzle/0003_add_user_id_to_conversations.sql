-- Add user_id column to conversations table
ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy_user';

-- After migration, you should update this default value with actual user IDs 