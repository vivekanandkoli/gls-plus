-- ============================================================================
-- Approval workflow for stock adjustments.
-- Staff submit a stock-update request (status 'pending'); an admin approves or
-- rejects it. Only 'approved' adjustments count toward the stock figure.
-- Existing rows default to 'approved' so nothing changes retroactively.
-- Run in Supabase → SQL Editor on each environment.
-- ============================================================================

alter table gls.stock_adjustments add column if not exists status           text not null default 'approved';
alter table gls.stock_adjustments add column if not exists approved_by      integer;
alter table gls.stock_adjustments add column if not exists approved_at      timestamptz;
alter table gls.stock_adjustments add column if not exists rejection_reason text;

do $$
begin
  alter table gls.stock_adjustments
    add constraint stock_adjustments_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception when duplicate_object then null;
end $$;
