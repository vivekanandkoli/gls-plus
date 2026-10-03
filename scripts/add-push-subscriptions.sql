-- ============================================================================
-- Web Push subscriptions for pending-approval notifications.
-- One row per device/browser a user enabled notifications on.
-- Reads/writes happen server-side via the service_role key (RLS bypassed);
-- RLS is enabled with no policies so nothing is readable by anon/authenticated.
-- Run in Supabase → SQL Editor on each environment.
-- ============================================================================

create table if not exists gls.push_subscriptions (
  id         uuid default gen_random_uuid() primary key,
  user_id    integer references gls.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz default now() not null
);

alter table gls.push_subscriptions enable row level security;
