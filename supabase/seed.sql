-- Local dev seed. Runs after migrations on `supabase start` / `supabase db reset`.
--
-- App (gls.users) profiles are linked to Supabase auth users, which must be
-- created through the auth API — use `npm run seed:demo-users` for that (it
-- needs SUPABASE_SERVICE_ROLE_KEY). This file only seeds non-auth reference data.

-- A few demo clients so the transaction forms have something to pick.
insert into gls.clients (name) values
  ('Walk-in Customer'),
  ('Ahura'),
  ('Dinesh Pande')
on conflict do nothing;

-- Example opening balances for the current year. Replace with the owner's real
-- figures (or set them in Settings once the UI is live).
update gls.opening_balances
   set opening_stock_gm = 0, opening_wac = 0, opening_stock_value_thb = 0
 where year = extract(year from now())::int;
