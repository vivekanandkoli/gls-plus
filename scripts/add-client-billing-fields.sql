-- ============================================================================
-- Add billing fields to gls.clients.
--
-- The clients UI (new / edit / detail) and the invoice renderer already read
-- and write tax_id, address and notes, but the table was created without them,
-- so the values were silently dropped and never appeared on invoices.
--
-- Safe, additive migration. Run in Supabase → SQL Editor (service-role /
-- postgres) on each environment.
-- ============================================================================

alter table gls.clients add column if not exists tax_id  text;
alter table gls.clients add column if not exists address text;
alter table gls.clients add column if not exists notes   text;
