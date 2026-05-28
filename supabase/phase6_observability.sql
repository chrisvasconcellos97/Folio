-- Phase 6 — observability.
--
-- One self-hosted error sink (no Sentry, no LogRocket). Every uncaught React
-- render error, unhandled promise rejection, final-retry network failure, and
-- Pip API failure logs a row here through the user's Supabase session.
--
-- RLS-scoped per user: a user can only ever read/write their own error rows.
-- Errors are best-effort writes from the client; a failed insert never blocks
-- the user-facing operation that raised the error.
--
-- Safe to re-run: every table / index / policy uses if-not-exists or
-- drop-if-exists. Additive only — no destructive migrations.

create table if not exists folio_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  org_id      uuid,
  error_type  text not null,           -- 'react' | 'network' | 'pip' | 'unhandled' | 'rejection'
  message     text not null,
  stack       text,
  source_url  text,                    -- where in the app it happened (window.location.pathname)
  user_agent  text,
  context     jsonb,                   -- caller-supplied metadata, e.g. { action: 'log_meeting', accountId }
  resolved    boolean default false,
  created_at  timestamptz default now()
);

-- Hot path: "show me my last N errors" + "do I have unresolved ones?"
create index if not exists folio_errors_user_time_idx
  on folio_errors(user_id, created_at desc);

create index if not exists folio_errors_unresolved_idx
  on folio_errors(user_id, resolved) where resolved = false;

alter table folio_errors enable row level security;

-- Owner-scoped policies. No cross-user reads.
drop policy if exists "errors_owner_select" on folio_errors;
create policy "errors_owner_select" on folio_errors
  for select using (auth.uid() = user_id);

drop policy if exists "errors_owner_insert" on folio_errors;
create policy "errors_owner_insert" on folio_errors
  for insert with check (auth.uid() = user_id);

drop policy if exists "errors_owner_update" on folio_errors;
create policy "errors_owner_update" on folio_errors
  for update using (auth.uid() = user_id);
