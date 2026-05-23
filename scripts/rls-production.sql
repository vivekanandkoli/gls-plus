-- Production RLS: remove all anonymous access; require authenticated session.
-- Run in Supabase → SQL Editor (with service-role or postgres role).
-- Tables are in the "gls" PostgREST schema.

-- ── Enable RLS on every app table ──────────────────────────────────────────

alter table if exists gls.transactions  enable row level security;
alter table if exists gls.clients       enable row level security;
alter table if exists gls.stock_ledger  enable row level security;
alter table if exists gls.settings      enable row level security;
alter table if exists gls.audit_log     enable row level security;

-- ── Drop legacy dev / anon policies ────────────────────────────────────────

drop policy if exists "dev_anon_read_clients"      on gls.clients;
drop policy if exists "dev_anon_read_transactions" on gls.transactions;
drop policy if exists "dev_anon_read_stock_ledger" on gls.stock_ledger;
drop policy if exists "dev_anon_read_settings"     on gls.settings;

-- ── Create authenticated-only policies ─────────────────────────────────────

-- transactions
drop policy if exists "authenticated_all_transactions" on gls.transactions;
create policy "authenticated_all_transactions"
  on gls.transactions for all
  to authenticated
  using (true)
  with check (true);

-- clients
drop policy if exists "authenticated_all_clients" on gls.clients;
create policy "authenticated_all_clients"
  on gls.clients for all
  to authenticated
  using (true)
  with check (true);

-- stock_ledger
drop policy if exists "authenticated_all_stock_ledger" on gls.stock_ledger;
create policy "authenticated_all_stock_ledger"
  on gls.stock_ledger for all
  to authenticated
  using (true)
  with check (true);

-- settings
drop policy if exists "authenticated_all_settings" on gls.settings;
create policy "authenticated_all_settings"
  on gls.settings for all
  to authenticated
  using (true)
  with check (true);

-- audit_log: authenticated users can read and append (manual stock adjustments, etc.).
drop policy if exists "authenticated_read_audit_log" on gls.audit_log;
drop policy if exists "authenticated_insert_audit_log" on gls.audit_log;

create policy "authenticated_read_audit_log"
  on gls.audit_log for select
  to authenticated
  using (true);

create policy "authenticated_insert_audit_log"
  on gls.audit_log for insert
  to authenticated
  with check (true);
