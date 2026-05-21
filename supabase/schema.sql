-- Folio schema — run in Supabase SQL editor

-- Accounts
create table if not exists folio_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  revenue     text,
  tier        text check (tier in ('Major', 'Mid', 'Growth')),
  status      text default 'green' check (status in ('green', 'yellow', 'red')),
  objective   text,
  next_meeting date,
  last_meeting date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
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

-- Auto-update updated_at on folio_accounts
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
