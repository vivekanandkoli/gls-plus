-- ============================================================
-- GLS Plus — Deals table migration
-- Run in Supabase SQL Editor (schema: gls)
-- ============================================================

-- ── 1. Sequential invoice counter per day ────────────────────
CREATE TABLE IF NOT EXISTS gls.invoice_counters (
  date     DATE NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'cash')),
  counter  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, type)
);

-- ── 2. Deals table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gls.deals (
  id                SERIAL PRIMARY KEY,
  date              DATE NOT NULL,
  weight_gm         DECIMAL(10, 3) NOT NULL,

  -- Buy side (from wholesaler)
  buy_client_id     INTEGER REFERENCES gls.clients(id),
  buy_rate          DECIMAL(10, 4) NOT NULL,
  buy_amount        DECIMAL(15, 2),         -- weight_gm × buy_rate

  -- Sell side (to customer)
  sell_client_id    INTEGER REFERENCES gls.clients(id),
  sell_rate         DECIMAL(10, 4) NOT NULL,
  sell_amount       DECIMAL(15, 2),         -- weight_gm × sell_rate

  -- Trading profit (owner private, never on invoice)
  trading_profit    DECIMAL(15, 2),         -- sell_amount - buy_amount
  profit_pct        DECIMAL(8, 4),          -- trading_profit/buy_amount×100

  -- Invoice numbers
  buy_invoice       TEXT NOT NULL,
  sell_invoice      TEXT NOT NULL,

  -- Payment
  payment_mode      TEXT NOT NULL CHECK (payment_mode IN ('cash','bank','qr','cheque')),
  is_cash           BOOLEAN GENERATED ALWAYS AS (payment_mode = 'cash') STORED,

  -- WAC persisted columns (computed on approval)
  wac_at_sale       DECIMAL(12, 4),
  cost_of_sale      DECIMAL(15, 2),
  wac_profit_loss   DECIMAL(15, 2),

  -- Workflow
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason  TEXT,
  notes             TEXT,
  created_by        INTEGER,
  approved_by       INTEGER,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deals_date       ON gls.deals (date);
CREATE INDEX IF NOT EXISTS idx_deals_status     ON gls.deals (status);
CREATE INDEX IF NOT EXISTS idx_deals_is_cash    ON gls.deals (is_cash);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON gls.deals (created_at);
CREATE INDEX IF NOT EXISTS idx_deals_wac        ON gls.deals (date, created_at, id)
  WHERE is_cash = false AND status = 'approved';

-- ── 4. Enable RLS (match existing tables) ───────────────────
ALTER TABLE gls.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gls.invoice_counters ENABLE ROW LEVEL SECURITY;

-- ── 5. Safety migration (idempotent) ─────────────────────────
-- If the table was created before WAC columns were added, add them now.
ALTER TABLE gls.deals
  ADD COLUMN IF NOT EXISTS wac_at_sale     DECIMAL(12, 4),
  ADD COLUMN IF NOT EXISTS cost_of_sale    DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS wac_profit_loss DECIMAL(15, 2);
