-- Optional indexes for large gls.transactions tables (run in Supabase SQL editor).
-- Review with EXPLAIN on your heaviest queries before applying in production.

create index if not exists idx_transactions_date_id_desc
  on gls.transactions (date desc, id desc);

create index if not exists idx_transactions_type_date
  on gls.transactions (type, date desc);

create index if not exists idx_transactions_amount_thb
  on gls.transactions (amount_thb);

-- If you filter heavily by invoice ilike patterns, consider pg_trgm on invoice_number:
-- create extension if not exists pg_trgm;
-- create index if not exists idx_transactions_invoice_trgm
--   on gls.transactions using gin (invoice_number gin_trgm_ops);
