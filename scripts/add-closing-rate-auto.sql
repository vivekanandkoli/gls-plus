-- Owner/period method: when closing_rate_auto is true, value closing stock at
-- the LATEST approved sell rate for that (book, year) instead of the stored
-- fixed closing_rate. closing_rate still holds the last effective rate (for
-- display / fallback when there are no sells).
alter table gls.opening_balances
  add column if not exists closing_rate_auto boolean not null default false;

comment on column gls.opening_balances.closing_rate_auto is
  'When true, the owner/period method values closing stock at the latest approved sell rate (dynamic) rather than the fixed closing_rate.';
