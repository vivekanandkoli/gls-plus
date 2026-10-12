-- Generalise the activity log so it can record changes to any entity
-- (transactions already use transaction_id; add a generic entity ref for
-- other_income, bookings, clients, etc.).
alter table gls.activity_log add column if not exists entity_type text;
alter table gls.activity_log add column if not exists entity_id text;

create index if not exists activity_log_entity_idx on gls.activity_log (entity_type, entity_id);

-- Backfill existing transaction rows so they show up under the generic view too.
update gls.activity_log
   set entity_type = 'transaction',
       entity_id   = transaction_id::text
 where transaction_id is not null
   and entity_type is null;
