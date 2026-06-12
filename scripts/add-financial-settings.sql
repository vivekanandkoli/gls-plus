-- Migration: add financial P&L settings columns to gls.settings
-- Run once in Supabase SQL editor (service role / postgres).
-- All tables live in the "gls" schema.

-- Step 1: add the two new columns (safe if they already exist)
ALTER TABLE gls.settings
  ADD COLUMN IF NOT EXISTS opening_stock_value_thb numeric(18,2) DEFAULT 6665493.20,
  ADD COLUMN IF NOT EXISTS closing_rate_owner       numeric(12,4) DEFAULT 4260.0000;

-- Step 2: back-fill the first (and only) row with the defaults.
--   Works regardless of whether id is uuid, integer, or bigint —
--   we just update every row (there is only one settings row).
UPDATE gls.settings
SET
  opening_stock_value_thb = COALESCE(opening_stock_value_thb, 6665493.20),
  closing_rate_owner       = COALESCE(closing_rate_owner,       4260.0000);
