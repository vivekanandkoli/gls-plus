-- RBAC + transaction approval workflow migration for gls schema.
-- Run in Supabase SQL Editor (service role / postgres).

-- ── Users table (app profile linked to Supabase auth) ───────────────────────

create table if not exists gls.users (
  id serial primary key,
  auth_id uuid not null unique,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists users_auth_id_idx on gls.users (auth_id);
create index if not exists users_email_idx on gls.users (email);

-- ── Transaction approval columns ────────────────────────────────────────────

alter table gls.transactions
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

alter table gls.transactions
  add column if not exists created_by integer references gls.users(id);

alter table gls.transactions
  add column if not exists approved_by integer references gls.users(id);

alter table gls.transactions
  add column if not exists approved_at timestamptz;

alter table gls.transactions
  add column if not exists rejection_reason text;

create index if not exists transactions_status_idx on gls.transactions (status);
create index if not exists transactions_created_by_idx on gls.transactions (created_by);

-- Existing rows were live before approval workflow — treat as approved.
update gls.transactions set status = 'approved' where status = 'pending';

-- ── Transaction audit log ───────────────────────────────────────────────────

create table if not exists gls.transaction_audit_log (
  id bigserial primary key,
  transaction_id uuid references gls.transactions(id) on delete set null,
  action text not null,
  performed_by integer references gls.users(id),
  old_values jsonb,
  new_values jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists transaction_audit_log_tx_idx
  on gls.transaction_audit_log (transaction_id);
create index if not exists transaction_audit_log_ts_idx
  on gls.transaction_audit_log (timestamp desc);

-- ── RLS for new tables ──────────────────────────────────────────────────────

alter table gls.users enable row level security;
alter table gls.transaction_audit_log enable row level security;

drop policy if exists "authenticated_read_users" on gls.users;
create policy "authenticated_read_users"
  on gls.users for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_transaction_audit_log" on gls.transaction_audit_log;
create policy "authenticated_read_transaction_audit_log"
  on gls.transaction_audit_log for select
  to authenticated
  using (true);

-- Inserts/updates on users and audit_log go through service role API routes.
