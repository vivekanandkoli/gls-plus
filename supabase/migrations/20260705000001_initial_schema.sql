-- ============================================================================
-- GLS Plus — clean-slate schema for the two-ledger (official / unofficial) model
-- ============================================================================
-- This is the new baseline. It intentionally does NOT carry legacy tables
-- (deals, transaction_mode, etc.) — the model starts fresh.
--
-- Model recap:
--   • Two independent ledgers, discriminated by `book`:
--       - unofficial = the truth / real vault (cash only). Owner's ACTUAL P/L.
--       - official   = declared-for-tax view (any payment mode). Audit only.
--   • They are NEVER summed. Each has its own WAC chain + stock + invoices,
--     seeded from opening_balances per (year, book).
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists gls;

-- ── Clients ─────────────────────────────────────────────────────────────────
create table gls.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);
create unique index clients_name_key on gls.clients (lower(name));

-- ── Users (app profile linked to Supabase auth) ─────────────────────────────
create table gls.users (
  id         serial primary key,
  auth_id    uuid not null unique,
  email      text not null,
  role       text not null default 'user' check (role in ('admin', 'user')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index users_auth_id_idx on gls.users (auth_id);
create index users_email_idx   on gls.users (email);

-- ── Opening balances — per year, per book ───────────────────────────────────
-- WAC for each book runs continuously from its year-opening balance.
create table gls.opening_balances (
  year                    int  not null,
  book                    text not null check (book in ('official', 'unofficial')),
  opening_stock_gm        numeric(14, 3) not null default 0,
  opening_wac             numeric(12, 4) not null default 0,
  opening_stock_value_thb numeric(18, 2) not null default 0,
  primary key (year, book)
);

-- ── Transactions — unified table, `book` discriminator ──────────────────────
create table gls.transactions (
  id            uuid primary key default gen_random_uuid(),
  book          text not null check (book in ('official', 'unofficial')),
  date          date not null,
  type          text not null check (type in ('BUY', 'SELL')),
  client_id     uuid references gls.clients(id),
  weight_grams  numeric(14, 3) not null,
  rate_per_gram numeric(12, 4) not null,
  amount_thb    numeric(16, 2) not null,
  payment_mode  text not null check (payment_mode in ('bank', 'qr', 'cheque', 'cash')),
  vat_percent   numeric(6, 3),                 -- official only
  invoice_number text,
  notes         text,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),

  -- WAC persisted (computed on approval; SELL only)
  wac_at_sale   numeric(12, 4),
  cost_of_sale  numeric(16, 2),
  profit_loss   numeric(16, 2),

  -- Paired entry (deals folded in): a SELL may link to its paired BUY
  paired_txn_id uuid references gls.transactions(id) on delete set null,

  -- Workflow
  created_by       integer references gls.users(id),
  approved_by      integer references gls.users(id),
  approved_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),

  -- Unofficial book is cash-only
  constraint unofficial_is_cash
    check (book <> 'unofficial' or payment_mode = 'cash')
);
create index transactions_book_idx       on gls.transactions (book);
create index transactions_status_idx     on gls.transactions (status);
create index transactions_book_date_idx  on gls.transactions (book, date, created_at, id);
create index transactions_client_idx     on gls.transactions (client_id);

-- ── Stock adjustments — admin only, per book ────────────────────────────────
create table gls.stock_adjustments (
  id          bigserial primary key,
  book        text not null check (book in ('official', 'unofficial')),
  date        date not null,
  delta_gm    numeric(14, 3) not null,        -- signed; +add / -remove
  reason      text not null,
  adjusted_by integer references gls.users(id),
  created_at  timestamptz not null default now()
);
create index stock_adjustments_book_idx on gls.stock_adjustments (book, date);

-- ── Invoice counters — per book, per day, per type ──────────────────────────
create table gls.invoice_counters (
  book    text not null check (book in ('official', 'unofficial')),
  date    date not null,
  type    text not null check (type in ('BUY', 'SELL')),
  counter integer not null default 0,
  primary key (book, date, type)
);

-- ── Activity / audit log ────────────────────────────────────────────────────
create table gls.activity_log (
  id             bigserial primary key,
  transaction_id uuid references gls.transactions(id) on delete set null,
  action         text not null,
  performed_by   integer references gls.users(id),
  old_values     jsonb,
  new_values     jsonb,
  created_at     timestamptz not null default now()
);
create index activity_log_tx_idx on gls.activity_log (transaction_id);
create index activity_log_ts_idx on gls.activity_log (created_at desc);

-- ── Settings — singleton row ────────────────────────────────────────────────
create table gls.settings (
  id                                integer primary key default 1,
  company_name                      text,
  company_name_th                   text,
  tax_id                            text,
  phone                             text,
  email                             text,
  website                           text,
  address_1                         text,
  address_2                         text,
  logo_url                          text,
  official_low_stock_threshold_gm   numeric(14, 3) default 0,
  unofficial_low_stock_threshold_gm numeric(14, 3) default 0,
  default_vat_percent               numeric(6, 3) default 7,
  -- Invoice prefixes (owner-configurable). Unofficial uses a distinct series.
  invoice_prefix_official_buy       text default 'IV',
  invoice_prefix_official_sell      text default 'UP',
  invoice_prefix_unofficial         text default 'PV',
  invoice_footer                    text,
  constraint settings_singleton check (id = 1)
);
insert into gls.settings (id) values (1) on conflict do nothing;

-- Seed empty opening balances for the current year so Settings can edit them.
insert into gls.opening_balances (year, book) values
  (extract(year from now())::int, 'official'),
  (extract(year from now())::int, 'unofficial')
on conflict do nothing;

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Authenticated users may READ; all writes go through service-role API routes.
alter table gls.clients            enable row level security;
alter table gls.users              enable row level security;
alter table gls.opening_balances   enable row level security;
alter table gls.transactions       enable row level security;
alter table gls.stock_adjustments  enable row level security;
alter table gls.invoice_counters   enable row level security;
alter table gls.activity_log       enable row level security;
alter table gls.settings           enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','users','opening_balances','transactions',
    'stock_adjustments','invoice_counters','activity_log','settings'
  ]
  loop
    execute format(
      'drop policy if exists authenticated_read on gls.%I;', t);
    execute format(
      'create policy authenticated_read on gls.%I for select to authenticated using (true);', t);
  end loop;
end $$;
