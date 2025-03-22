-- Add subscriptions table
CREATE TABLE IF NOT EXISTS "subscriptions" (
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
  "updated_at" INTEGER NOT NULL
); 