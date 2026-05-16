-- Run in Supabase → SQL → New query (development: allow public read of app tables).
-- Adjust or remove in production; prefer auth-based policies.

alter table if exists public.clients enable row level security;
alter table if exists public.transactions enable row level security;
alter table if exists public.stock_ledger enable row level security;
alter table if exists public.settings enable row level security;

drop policy if exists "dev_anon_read_clients" on public.clients;
create policy "dev_anon_read_clients" on public.clients for select to anon, authenticated using (true);

drop policy if exists "dev_anon_read_transactions" on public.transactions;
create policy "dev_anon_read_transactions" on public.transactions for select to anon, authenticated using (true);

drop policy if exists "dev_anon_read_stock_ledger" on public.stock_ledger;
create policy "dev_anon_read_stock_ledger" on public.stock_ledger for select to anon, authenticated using (true);

drop policy if exists "dev_anon_read_settings" on public.settings;
create policy "dev_anon_read_settings" on public.settings for select to anon, authenticated using (true);

drop policy if exists "dev_authenticated_write_clients" on public.clients;
create policy "dev_authenticated_write_clients" on public.clients for all to authenticated using (true) with check (true);

-- Inserts/updates: allow anon for local dev only if you use INSERT from the app;
-- the migration script should use the service role from .env, not the browser.
