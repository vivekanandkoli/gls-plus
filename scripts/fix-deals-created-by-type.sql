-- Fixes a column-type bug from the original deals migration.
--
-- gls.deals.created_by / approved_by were created as UUID, but every other
-- table in this app (transactions.created_by/approved_by) uses INTEGER
-- referencing gls.users(id) — the app's internal user id, not the Supabase
-- auth UUID. This mismatch means createDeal()/approveDeal()/rejectDeal()
-- fail whenever they try to insert user.id (an integer) into these columns.
--
-- Safe to run: the deals table has zero rows as of this writing (the
-- feature has never successfully created a deal because of this bug plus
-- the buy_client_id/sell_client_id type bug fixed in the same release).
-- If that has changed, back up gls.deals before running this.

ALTER TABLE gls.deals DROP COLUMN IF EXISTS created_by;
ALTER TABLE gls.deals DROP COLUMN IF EXISTS approved_by;

ALTER TABLE gls.deals ADD COLUMN created_by INTEGER REFERENCES gls.users(id);
ALTER TABLE gls.deals ADD COLUMN approved_by INTEGER REFERENCES gls.users(id);
