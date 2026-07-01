-- Conference Prep (item 56) — pre-departure readiness for a conference, NOT
-- an in-event tool (that's Lanyard's lane, deliberately untouched). Closing
-- loose ends across the portfolio + tracking presentation prep before you fly
-- out, paired with PTO/Away Mode for the trip itself.
--
-- Deliberately ISOLATED: one small, generic table (reusable for every future
-- conference, not ABPA-specific) with minimal touchpoints into the rest of
-- the app, so a future Lanyard rebuild can read `account_ids` directly for
-- its partner list without this needing to be re-threaded.
--
-- DATA LINE: name/location/dates/notes are the user's own scheduling — no
-- shop/customer/revenue figures belong here, same rule as every other note.
--
-- Run in the Supabase SQL Editor. All additive/nullable — zero risk to the
-- running app.

create table if not exists folio_conferences (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  name              text not null,
  location          text,
  start_date        date not null,
  end_date          date not null,
  account_ids       uuid[] default '{}',  -- partner accounts attending
  gauge_project_id  uuid references gauge_projects on delete set null,
  away_period_id    uuid references folio_away_periods on delete set null,
  notes             text,
  created_at        timestamptz default now()
);

create index if not exists folio_conferences_user_idx
  on folio_conferences (user_id, start_date);

alter table folio_conferences enable row level security;
drop policy if exists "Conferences owner access" on folio_conferences;
create policy "Conferences owner access" on folio_conferences
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Data lineage only — away mode itself stays conference-agnostic; this just
-- lets a "While you were out" surface note the away window came from a
-- conference if that's ever useful.
alter table folio_away_periods add column if not exists conference_id
  uuid references folio_conferences on delete set null;
