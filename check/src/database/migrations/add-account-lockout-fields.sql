-- Add account lockout fields to users table
ALTER TABLE users ADD COLUMN accountLocked INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN accountLockedAt INTEGER;
ALTER TABLE users ADD COLUMN accountLockReason TEXT;
ALTER TABLE users ADD COLUMN unlockToken TEXT;
ALTER TABLE users ADD COLUMN unlockTokenGeneratedAt INTEGER;

-- Create index for unlock token lookups
CREATE INDEX idx_users_unlockToken ON users(unlockToken);