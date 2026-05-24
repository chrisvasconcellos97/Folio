-- Folio schema — run in Supabase SQL editor
-- Includes all columns from incremental migrations; safe to re-run (IF NOT EXISTS throughout)

-- Accounts
create table if not exists folio_accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users not null,
  name                    text not null,
  revenue                 text,
  tier                    text check (tier in ('Major', 'Mid', 'Growth')),
  status                  text default 'green' check (status in ('green', 'yellow', 'red')),
  objective               text,
  next_meeting            date,
  last_meeting            date,
  last_interaction_at     timestamptz,
  pip_account_summary     text,
  pip_account_summary_at  timestamptz,
  region                  text,
  tags                    text[] default '{}',
  serviced_states         text[] default '{}',
  market_scope            text,
  parent_account_id       uuid references folio_accounts,
  account_type            text DEFAULT 'standard',
  account_number          text,
  address                 text,
  lat                     float8,
  lng                     float8,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table folio_accounts enable row level security;
create policy "Users manage own accounts"
  on folio_accounts for all
  using (auth.uid() = user_id);

-- Contacts
create table if not exists folio_contacts (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  name       text not null,
  title      text,
  phone      text,
  email      text,
  linkedin   text,
  is_poc     boolean default false,
  notes      text,
  created_at timestamptz default now()
);

alter table folio_contacts enable row level security;
create policy "Users manage own contacts"
  on folio_contacts for all
  using (auth.uid() = user_id);

-- Meetings
create table if not exists folio_meetings (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid references folio_accounts on delete cascade not null,
  user_id        uuid references auth.users not null,
  title          text,
  meeting_date   date,
  notes          text,
  talking_points text,
  action_items   text,
  commitments    text,
  follow_up_date date,
  rating         integer check (rating between 1 and 5),
  attendees      text[],
  pip_summary    text,
  pip_email      text,
  created_at     timestamptz default now()
);

alter table folio_meetings enable row level security;
create policy "Users manage own meetings"
  on folio_meetings for all
  using (auth.uid() = user_id);

-- Open Items
create table if not exists folio_items (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  text       text not null,
  due_date   date,
  owner      text,
  done       boolean default false,
  closed_at  timestamptz,
  created_at timestamptz default now()
);

alter table folio_items enable row level security;
create policy "Users manage own items"
  on folio_items for all
  using (auth.uid() = user_id);

-- Cadences
create table if not exists folio_cadences (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  account_id    uuid references folio_accounts(id) on delete cascade not null,
  type          text not null default 'meeting' check (type in ('meeting', 'task')),
  frequency     text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  day_of_week   int check (day_of_week >= 0 and day_of_week <= 6),
  day_of_month  int check (day_of_month >= 1 and day_of_month <= 31),
  meeting_time  text,
  task_title    text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table folio_cadences enable row level security;
create policy "Users manage their own cadences"
  on folio_cadences for all
  using (auth.uid() = user_id);

-- Quick Tasks
create table if not exists folio_quick_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  account_id  uuid references folio_accounts on delete set null,
  title       text not null,
  notes       text,
  done        boolean default false,
  reminder_at timestamptz,
  created_at  timestamptz default now()
);

alter table folio_quick_tasks enable row level security;
create policy "Users manage own quick tasks"
  on folio_quick_tasks for all
  using (auth.uid() = user_id);

-- Gauge Projects
create table if not exists gauge_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  account_id  uuid references folio_accounts on delete cascade,
  meeting_id  uuid references folio_meetings on delete set null,
  title       text not null,
  description text,
  status      text default 'planned'
              check (status in ('planned', 'in_progress', 'blocked', 'complete', 'on_hold')),
  priority    text default 'medium'
              check (priority in ('high', 'medium', 'low')),
  due_date    date,
  assignee    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table gauge_projects enable row level security;
create policy "Authenticated users access projects"
  on gauge_projects for all
  using (auth.uid() is not null);

-- Auto-update updated_at trigger (shared)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger folio_accounts_updated_at
  before update on folio_accounts
  for each row execute function update_updated_at();

create trigger folio_cadences_updated_at
  before update on folio_cadences
  for each row execute function update_updated_at();

create trigger gauge_projects_updated_at
  before update on gauge_projects
  for each row execute function update_updated_at();
