-- Gauge schema — run in Supabase SQL editor after folio schema

create table if not exists gauge_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  account_id  uuid references folio_accounts on delete cascade,
  meeting_id  uuid references folio_meetings on delete set null,
  title       text not null,
  description text,
  status      text default 'active'
              check (status in ('active', 'on_hold', 'completed', 'cancelled')),
  priority    text default 'medium'
              check (priority in ('high', 'medium', 'low')),
  due_date    date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table gauge_projects enable row level security;

create policy "Users manage own projects"
  on gauge_projects for all
  using (auth.uid() = user_id);

create trigger gauge_projects_updated_at
  before update on gauge_projects
  for each row execute function update_updated_at();
