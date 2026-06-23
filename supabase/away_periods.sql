-- PTO / Away Mode (#50) — Pip knows when you were out, so silence ≠ failure.
--
-- Set via a "Set PTO" entry on the calendar (a date range). Drives: suppressing
-- false "you went quiet / dropped it" alarms over the window, excusing
-- commitments that came due while away from the "promises kept" score, and the
-- "While you were out" return catch-up.
--
-- Run in the Supabase SQL Editor. All additive / nullable — zero risk to the
-- running app, and the app reads it fail-soft (missing table → no-op).

create table if not exists folio_away_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_at  timestamptz default now()
);

create index if not exists folio_away_periods_user_idx
  on folio_away_periods (user_id, start_date);

alter table folio_away_periods enable row level security;
drop policy if exists "Away periods owner access" on folio_away_periods;
create policy "Away periods owner access" on folio_away_periods
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- "Arrived while you were out → follow up on return." Tagged on items/meetings
-- filed from the return-from-vacation summary; surfaced in "While you were out"
-- until the user clears them.
alter table folio_tasks    add column if not exists follow_up_on_return boolean default false;
alter table folio_meetings add column if not exists follow_up_on_return boolean default false;
