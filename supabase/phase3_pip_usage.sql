-- Phase 3 — Pip usage tracking.
--
-- Every Anthropic call from /api/pip, /api/ask-pip, and /api/pip-state-refresh
-- writes a row here so we can see actual spend per user and per month.
--
-- Best-effort: API routes insert with the user's auth token (RLS-scoped); a
-- failed insert never blocks the user-facing request.
--
-- Cost numbers are stored in **micro-cents** (cents × 10,000) to keep the
-- arithmetic in integers and avoid float drift across millions of rows. Read
-- side divides back to dollars for display.

create table if not exists folio_pip_usage (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  endpoint                text not null,                       -- 'pip' | 'ask-pip' | 'pip-state-refresh'
  mode                    text,                                -- 'chat' | 'brief' | 'summary' | 'meeting' | 'account' | 'state-refresh' ...
  model                   text not null,                       -- exact model id sent to Anthropic
  input_tokens            integer not null default 0,
  output_tokens           integer not null default 0,
  cache_read_tokens       integer not null default 0,
  cache_creation_tokens   integer not null default 0,
  cost_micro_cents        bigint  not null default 0,          -- billed cost in cents × 10,000
  created_at              timestamptz not null default now()
);

create index if not exists folio_pip_usage_user_time_idx
  on folio_pip_usage(user_id, created_at desc);

create index if not exists folio_pip_usage_user_month_idx
  on folio_pip_usage(user_id, date_trunc('month', created_at));

alter table folio_pip_usage enable row level security;

-- Owner select: a user only ever sees their own usage rows. No other user_id
-- ever leaks through this table (this is the privacy guarantee the spec asks
-- for — see "DO NOT expose user-id of the calling user to other users").
drop policy if exists "pip_usage_owner_select" on folio_pip_usage;
create policy "pip_usage_owner_select" on folio_pip_usage
  for select using (auth.uid() = user_id);

-- Insert only your own rows. API routes attach the caller's auth token, so
-- this is the policy that lets server-side `insert` succeed without a
-- service-role key.
drop policy if exists "pip_usage_owner_insert" on folio_pip_usage;
create policy "pip_usage_owner_insert" on folio_pip_usage
  for insert with check (auth.uid() = user_id);

-- No update/delete policies — usage rows are append-only.
