-- Pip rolling cache of account state.
-- Pip generates a tight prose blob per account (2-3 sentences: last contact,
-- momentum, signals, risks) and stores it here. Cheap chat-mode "give me a
-- one-liner on X" calls read from this cache instead of regenerating from
-- raw data. Refreshed daily via /api/pip-state-refresh (Haiku, Batch API).

create table if not exists folio_pip_account_state (
  account_id    uuid primary key references folio_accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  state_prose   text not null,
  health_signal text,                       -- 'green' | 'yellow' | 'red'
  momentum      text,                       -- 'up' | 'flat' | 'down'
  risk_flags    text[],                     -- short tags like 'overdue_items', 'long_silence'
  generated_at  timestamptz not null default now(),
  stale_at      timestamptz                 -- when this row needs regeneration (set to now() + 24h on write)
);

alter table folio_pip_account_state enable row level security;

drop policy if exists "state_owner_select" on folio_pip_account_state;
drop policy if exists "state_owner_write"  on folio_pip_account_state;

create policy "state_owner_select" on folio_pip_account_state
  for select using (auth.uid() = user_id);

create policy "state_owner_write" on folio_pip_account_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists folio_pip_account_state_user
  on folio_pip_account_state(user_id);

create index if not exists folio_pip_account_state_stale
  on folio_pip_account_state(stale_at);
