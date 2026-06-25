-- The Mastermind / Synthesis layer (item 52) — Pip's proactive "Observations".
-- A periodic Sonnet pass writes 0-2 high-confidence observations here; the Home
-- "✦ Pip connected some dots" card reads the open ones. Persisted so an
-- observation survives until Chris acts on it or dismisses it.
--
-- FAIL-SOFT: useObservations swallows a missing-table error, so the app is
-- unaffected until this migration runs (same pattern as folio_away_periods).
-- Run this by hand in the Supabase SQL editor (MCP apply is unavailable).

create table if not exists folio_observations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- the stream fingerprint this batch was generated from (de-dupes re-runs)
  fingerprint  text,
  -- 'open' | 'acted' | 'dismissed'
  status       text not null default 'open',
  status_at    timestamptz,
  -- the observation payload: { kind, title, evidence, why, action_label,
  -- action_kind, action_payload, expected, accounts: [name,...] }
  observation  jsonb not null default '{}'::jsonb
);

alter table folio_observations enable row level security;

drop policy if exists "obs_select_own" on folio_observations;
create policy "obs_select_own" on folio_observations
  for select using ((select auth.uid()) = user_id);

drop policy if exists "obs_insert_own" on folio_observations;
create policy "obs_insert_own" on folio_observations
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "obs_update_own" on folio_observations;
create policy "obs_update_own" on folio_observations
  for update using ((select auth.uid()) = user_id);

drop policy if exists "obs_delete_own" on folio_observations;
create policy "obs_delete_own" on folio_observations
  for delete using ((select auth.uid()) = user_id);

-- Fast path for the Home card: this user's open observations, newest first.
create index if not exists idx_folio_observations_open
  on folio_observations (user_id, created_at desc)
  where status = 'open';
