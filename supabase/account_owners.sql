-- Account owners — explicit owner_user_id assignment per account.
-- Backfills existing accounts to their creator (user_id) so nothing is "unowned".
-- Safe to re-run.

alter table folio_accounts
  add column if not exists owner_user_id uuid references auth.users(id);

update folio_accounts
  set owner_user_id = user_id
  where owner_user_id is null;
