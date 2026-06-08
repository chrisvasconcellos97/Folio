-- ──────────────────────────────────────────────────────────────────────
-- Pip Autonomous Operator — Phase 1
--
-- The nightly loop (api/operator-run.js, fired by a Vercel cron) sweeps the
-- portfolio and *materializes* Pip's work so every surface can read it
-- instead of making its own LLM call. Two stores:
--
--   1. folio_pip_account_state  — extended with per-account "operator state"
--      (the situation, risks, a pre-drafted follow-up email, proposed moves,
--      a pre-built cadence agenda, and a "what changed since last run" delta).
--   2. folio_operator_reports   — one portfolio-level "operator report" per
--      user per local day: the prioritized plan + plan items the Home card
--      renders.
--
-- Writes happen via the service-role key inside the cron (RLS bypassed).
-- Reads happen from the client under the user's session, so RLS select
-- policies scope every read to auth.uid().
-- ──────────────────────────────────────────────────────────────────────

-- 1. Per-account operator state — additive columns on the existing table.
alter table folio_pip_account_state add column if not exists operator_situation      text;
alter table folio_pip_account_state add column if not exists operator_risks          text[];
alter table folio_pip_account_state add column if not exists operator_draft_email     text;
alter table folio_pip_account_state add column if not exists operator_proposed_moves  jsonb default '[]'::jsonb;
alter table folio_pip_account_state add column if not exists operator_agenda          text;
alter table folio_pip_account_state add column if not exists operator_delta           text;
alter table folio_pip_account_state add column if not exists operator_generated_at    timestamptz;

-- 2. Portfolio-level operator report — one row per user per local report date.
create table if not exists folio_operator_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  report_date     date not null,
  headline        text,
  report_prose    text,
  plan_items      jsonb not null default '[]'::jsonb,
  accounts_worked integer not null default 0,
  accounts_total  integer not null default 0,
  ran_reason      text,            -- 'weeknight' | 'weekend-activity'
  generated_at    timestamptz not null default now(),
  unique (user_id, report_date)
);

alter table folio_operator_reports enable row level security;

drop policy if exists "operator_reports_owner_select" on folio_operator_reports;
create policy "operator_reports_owner_select" on folio_operator_reports
  for select using (auth.uid() = user_id);

drop policy if exists "operator_reports_owner_write" on folio_operator_reports;
create policy "operator_reports_owner_write" on folio_operator_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists folio_operator_reports_user_date
  on folio_operator_reports (user_id, report_date desc);
