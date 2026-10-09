-- Advance bookings for BUY/SELL gold trades. A booking just reserves the agreed
-- terms (type, rate, weight, client); it has NO effect on stock, WAC or profit
-- until it is delivered and converted into a real transaction. Access is
-- service-role only (RLS on, no policies), like gls.transactions.
create table if not exists gls.bookings (
  id                     uuid primary key default gen_random_uuid(),
  book                   text not null check (book in ('official','unofficial')),
  type                   text not null check (type in ('BUY','SELL')),
  client_id              uuid references gls.clients(id),
  weight_grams           numeric(14,3) not null check (weight_grams > 0),
  rate_per_gram          numeric(14,4) not null check (rate_per_gram > 0),
  amount_thb             numeric(18,2),
  booking_date           date not null default current_date,
  expected_delivery_date date,
  status                 text not null default 'pending' check (status in ('pending','delivered','cancelled')),
  converted_txn_id       uuid references gls.transactions(id),
  notes                  text,
  cancelled_reason       text,
  created_by             integer references gls.users(id),
  created_at             timestamptz not null default now(),
  delivered_at           timestamptz,
  cancelled_at           timestamptz
);

alter table gls.bookings enable row level security;

create index if not exists bookings_status_idx on gls.bookings (status);
create index if not exists bookings_book_idx   on gls.bookings (book);
create index if not exists bookings_date_idx    on gls.bookings (booking_date desc);
