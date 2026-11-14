-- Optional hardening: make the booking -> transaction link survive a
-- transaction delete at the DB level too. The app already unlinks the booking
-- before deleting (app/api/transactions/[id]/route.ts), so this is defence in
-- depth for any other delete path.
alter table gls.bookings drop constraint if exists bookings_converted_txn_id_fkey;
alter table gls.bookings
  add constraint bookings_converted_txn_id_fkey
  foreign key (converted_txn_id) references gls.transactions(id) on delete set null;
