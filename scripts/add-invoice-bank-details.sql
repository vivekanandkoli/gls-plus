-- Company bank details shown on SELL invoices so clients know where to pay.
-- Editable by the owner from Settings → Company / Invoice.
-- Idempotent: safe to run more than once.
alter table gls.settings add column if not exists bank_name text;
alter table gls.settings add column if not exists bank_account_name text;
alter table gls.settings add column if not exists bank_account_number text;

-- Seed the current account on the single settings row (id = 1) only where empty,
-- so we never overwrite a value the owner has already set.
update gls.settings
   set bank_name            = coalesce(nullif(bank_name, ''), 'Kasikorn Bank'),
       bank_account_name    = coalesce(nullif(bank_account_name, ''), 'GLS PLUS CO. LTD'),
       bank_account_number  = coalesce(nullif(bank_account_number, ''), '1663787469')
 where id = 1;
