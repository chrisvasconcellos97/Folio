-- Cadence: recurring meeting schedules per account
-- Run once in Supabase SQL editor

create table if not exists folio_cadences (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  account_id    uuid references folio_accounts(id) on delete cascade not null,
  frequency     text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week   int check (day_of_week >= 0 and day_of_week <= 6),
  day_of_month  int check (day_of_month >= 1 and day_of_month <= 31),
  meeting_time  text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table folio_cadences enable row level security;

create policy "Users manage their own cadences" on folio_cadences
  for all using (auth.uid() = user_id);
