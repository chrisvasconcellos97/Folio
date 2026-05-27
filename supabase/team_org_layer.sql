-- Team/Org Layer — run in Supabase SQL editor
-- folio_orgs, folio_org_members, folio_account_notes, folio_activity
-- + org_id column on folio_accounts + new RLS policies

-- ─── folio_orgs ────────────────────────────────────────────────────────────
create table if not exists folio_orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid references auth.users not null,
  created_at timestamptz default now()
);
alter table folio_orgs enable row level security;

create policy "orgs_owner_all" on folio_orgs
  for all using (auth.uid() = owner_id);

-- ─── Security-definer helpers ──────────────────────────────────────────────
-- These break RLS recursion: a policy on folio_org_members can't safely
-- subquery folio_org_members (it re-triggers itself). The functions run with
-- the owner's privileges, bypassing RLS for the membership lookup only.
create or replace function folio_user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from folio_org_members
  where user_id = auth.uid() and accepted = true
$$;
grant execute on function folio_user_org_ids() to authenticated;

create or replace function folio_user_writable_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from folio_org_members
  where user_id = auth.uid() and accepted = true and role in ('owner','member')
$$;
grant execute on function folio_user_writable_org_ids() to authenticated;

create policy "orgs_member_read" on folio_orgs
  for select using (id in (select folio_user_org_ids()));

-- ─── folio_org_members ─────────────────────────────────────────────────────
create table if not exists folio_org_members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references folio_orgs on delete cascade not null,
  user_id       uuid references auth.users on delete cascade,  -- nullable until invite accepted
  role          text check (role in ('owner','member','leadership')) not null,
  invited_email text,
  accepted      boolean default false,
  created_at    timestamptz default now()
);
alter table folio_org_members enable row level security;

-- Owner can manage all members in their org
create policy "members_owner_all" on folio_org_members
  for all using (
    org_id in (select id from folio_orgs where owner_id = auth.uid())
  );

-- Members can see their own row
create policy "members_self_read" on folio_org_members
  for select using (user_id = auth.uid());

-- Members can accept their own invite (update user_id + accepted)
create policy "members_self_accept" on folio_org_members
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Members can see all members in orgs they belong to
create policy "members_org_read" on folio_org_members
  for select using (org_id in (select folio_user_org_ids()));

-- ─── folio_account_notes ───────────────────────────────────────────────────
create table if not exists folio_account_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references folio_orgs on delete cascade,
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  notes      text,
  updated_at timestamptz default now(),
  unique (account_id, user_id)
);
alter table folio_account_notes enable row level security;

-- Users only see their own notes (private per user)
create policy "notes_owner" on folio_account_notes
  for all using (auth.uid() = user_id);

-- ─── folio_activity ────────────────────────────────────────────────────────
create table if not exists folio_activity (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references folio_orgs on delete cascade,
  user_id    uuid references auth.users not null,
  account_id uuid references folio_accounts on delete cascade,
  event_type text not null,
  payload    jsonb default '{}',
  created_at timestamptz default now()
);
alter table folio_activity enable row level security;

-- All org members can read the activity feed
create policy "activity_org_read" on folio_activity
  for select using (org_id in (select folio_user_org_ids()));

-- Members can insert activity for their own org
create policy "activity_insert" on folio_activity
  for insert with check (
    auth.uid() = user_id and org_id in (select folio_user_org_ids())
  );

-- ─── org_id on folio_accounts ──────────────────────────────────────────────
alter table folio_accounts add column if not exists org_id uuid references folio_orgs;

-- Org members can read all accounts in their org (leadership included)
create policy "accounts_org_read" on folio_accounts
  for select using (
    org_id is not null and org_id in (select folio_user_org_ids())
  );

-- Non-leadership org members can write org accounts
create policy "accounts_org_write" on folio_accounts
  for all using (
    org_id is not null and org_id in (select folio_user_writable_org_ids())
  );

-- ─── Indexes ───────────────────────────────────────────────────────────────
create index if not exists idx_org_members_user_id on folio_org_members(user_id);
create index if not exists idx_org_members_org_id  on folio_org_members(org_id);
create index if not exists idx_activity_org_id     on folio_activity(org_id, created_at desc);
create index if not exists idx_account_notes_key   on folio_account_notes(account_id, user_id);
create index if not exists idx_accounts_org_id     on folio_accounts(org_id);
