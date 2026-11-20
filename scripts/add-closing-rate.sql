-- Owner/period method: a per-(year, book) closing rate used to value closing
-- stock for the declared profit figure. NULL = use WAC (the previous behaviour),
-- so adding this column changes nothing until an admin applies a rate.
alter table gls.opening_balances
  add column if not exists closing_rate numeric;

comment on column gls.opening_balances.closing_rate is
  'Owner closing rate (THB/g) for the period/spreadsheet profit method. NULL = value closing stock at WAC.';
