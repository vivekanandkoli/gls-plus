-- Add persisted WAC profit/loss columns to gls.transactions.
-- Run once in Supabase SQL Editor (schema: gls).

ALTER TABLE gls.transactions
  ADD COLUMN IF NOT EXISTS wac_at_sale numeric(12, 4),
  ADD COLUMN IF NOT EXISTS cost_of_sale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS profit_loss numeric(14, 2);

COMMENT ON COLUMN gls.transactions.wac_at_sale IS 'WAC at moment of sale (4 dp); NULL for BUY';
COMMENT ON COLUMN gls.transactions.cost_of_sale IS 'weight × wac_at_sale (2 dp); NULL for BUY';
COMMENT ON COLUMN gls.transactions.profit_loss IS 'amount_thb − cost_of_sale (2 dp); NULL for BUY';

CREATE INDEX IF NOT EXISTS idx_transactions_wac_pl
  ON gls.transactions (date, id)
  WHERE type = 'SELL';
