-- ============================================================================
-- Production RLS for the two-ledger `gls` schema.
-- Run in Supabase → SQL Editor (service-role / postgres).
--
-- Model:
--   • ALL WRITES go through server-side API routes using the service_role key,
--     which BYPASSES RLS. So there are deliberately NO write policies here.
--   • Authenticated users get scoped READ access only:
--       - staff (role 'user')  → the OFFICIAL book + shared reference data
--       - admin (role 'admin') → everything (incl. the unofficial/vault book,
--         audit log, users, stock adjustments)
-- Anonymous (anon) gets nothing.
-- ============================================================================

-- ── Admin check (SECURITY DEFINER avoids recursive RLS on gls.users) ────────
create or replace function gls.is_admin() returns boolean
  language sql security definer stable
  set search_path = gls, public
as $fn$
  select exists (
    select 1 from gls.users u
    where u.auth_id = auth.uid() and u.role = 'admin' and u.is_active
  );
$fn$;
revoke all on function gls.is_admin() from public, anon;
grant execute on function gls.is_admin() to authenticated;

-- ── Enable RLS on every table (idempotent) ──────────────────────────────────
alter table gls.transactions      enable row level security;
alter table gls.clients           enable row level security;
alter table gls.settings          enable row level security;
alter table gls.opening_balances  enable row level security;
alter table gls.stock_adjustments enable row level security;
alter table gls.invoice_counters  enable row level security;
alter table gls.activity_log      enable row level security;
alter table gls.users             enable row level security;

-- ── Drop the permissive dev read-all policies ───────────────────────────────
do $mig$
declare t text;
begin
  foreach t in array array[
    'transactions','clients','settings','opening_balances',
    'stock_adjustments','invoice_counters','activity_log','users'
  ] loop
    execute format('drop policy if exists "authenticated_read" on gls.%I;', t);
  end loop;
end $mig$;

-- ── Scoped read policies ────────────────────────────────────────────────────

-- Transactions: staff see the official book only; admins see both books.
drop policy if exists "read_transactions" on gls.transactions;
create policy "read_transactions" on gls.transactions
  for select to authenticated
  using (book = 'official' or gls.is_admin());

-- Shared reference data any signed-in user needs for the UI.
drop policy if exists "read_clients" on gls.clients;
create policy "read_clients" on gls.clients for select to authenticated using (true);

drop policy if exists "read_settings" on gls.settings;
create policy "read_settings" on gls.settings for select to authenticated using (true);

drop policy if exists "read_opening_balances" on gls.opening_balances;
create policy "read_opening_balances" on gls.opening_balances for select to authenticated using (true);

drop policy if exists "read_invoice_counters" on gls.invoice_counters;
create policy "read_invoice_counters" on gls.invoice_counters for select to authenticated using (true);

-- Admin-only reads (unofficial/vault-sensitive).
drop policy if exists "read_stock_adjustments" on gls.stock_adjustments;
create policy "read_stock_adjustments" on gls.stock_adjustments for select to authenticated using (gls.is_admin());

drop policy if exists "read_activity_log" on gls.activity_log;
create policy "read_activity_log" on gls.activity_log for select to authenticated using (gls.is_admin());

drop policy if exists "read_users" on gls.users;
create policy "read_users" on gls.users for select to authenticated using (gls.is_admin());

-- NOTE: no INSERT/UPDATE/DELETE policies — all writes are server-side via the
-- service_role key (which bypasses RLS). Never ship the service_role key to the browser.
