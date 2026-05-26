-- Gauge V2 Migration — run in Supabase SQL editor
-- Safe to run multiple times (IF NOT EXISTS throughout)

-- Multi-account linking
alter table gauge_projects add column if not exists account_ids uuid[] default '{}';

-- Project scope (personal | team)
alter table gauge_projects add column if not exists scope text default 'personal';

-- Blocked explanation
alter table gauge_projects add column if not exists blocked_reason text;

-- Start date
alter table gauge_projects add column if not exists start_date date;

-- Project Templates table
create table if not exists gauge_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  org_id      uuid,
  title       text not null,
  description text,
  stages      jsonb default '[]',
  created_at  timestamptz default now()
);

alter table gauge_templates enable row level security;
create policy "Template owner access"
  on gauge_templates for all
  using (auth.uid() = user_id);
