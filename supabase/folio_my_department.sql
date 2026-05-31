-- My Department flag — marks one department account as the user's own team.
-- Partial unique index enforces only one per user.

alter table folio_accounts
  add column if not exists is_my_department boolean not null default false;

create unique index if not exists folio_accounts_one_my_dept_per_user
  on folio_accounts (user_id)
  where is_my_department = true;
