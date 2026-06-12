-- Migration: Add transaction_mode column
-- Run in Supabase SQL Editor

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_mode TEXT NOT NULL DEFAULT 'official';

-- Ensure only valid values
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_mode_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_mode_check
  CHECK (transaction_mode IN ('official', 'cash'));

-- Index for fast filtering (e.g. official-only reports)
CREATE INDEX IF NOT EXISTS idx_transactions_mode
  ON transactions (transaction_mode);

-- Confirm
SELECT
  COUNT(*) FILTER (WHERE transaction_mode = 'official') AS official_count,
  COUNT(*) FILTER (WHERE transaction_mode = 'cash')     AS cash_count
FROM transactions;
