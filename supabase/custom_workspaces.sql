-- Custom workspaces: user-defined account groupings beyond the built-in types.
-- Run in production Supabase after deploying the app code.

create table if not exists folio_custom_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references folio_orgs(id) on delete set null,
  name text not null,
  include_in_portfolio boolean not null default false,
  created_at timestamptz not null default now()
);

alter table folio_custom_workspaces enable row level security;

create policy "users manage own custom workspaces"
  on folio_custom_workspaces for all
  using (auth.uid() = user_id);

alter table folio_accounts
  add column if not exists custom_workspace_id uuid references folio_custom_workspaces(id) on delete set null;
