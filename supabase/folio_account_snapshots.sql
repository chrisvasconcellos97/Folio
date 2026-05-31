-- Gauge V3 / Pip Tier A — daily account state snapshots.
-- One row per (user_id, account_id, snapshot_date).
-- Computed client-side on app load, once per day.
-- Foundation for Pip's cross-portfolio intelligence.

create table if not exists folio_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references folio_accounts(id) on delete cascade,
  snapshot_date date not null default current_date,
  health_status text not null default 'healthy', -- healthy | watching | at_risk | new
  health_score numeric(5,2) not null default 0,
  days_since_contact integer,
  open_item_count integer not null default 0,
  overdue_item_count integer not null default 0,
  active_project_count integer not null default 0,
  stuck_project_count integer not null default 0,
  pip_tone text, -- last known tone from pip_tone column on folio_accounts
  created_at timestamptz not null default now(),
  unique(user_id, account_id, snapshot_date)
);

alter table folio_account_snapshots enable row level security;

create policy "Users access own snapshots"
  on folio_account_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists folio_account_snapshots_user_date
  on folio_account_snapshots (user_id, snapshot_date desc);

create index if not exists folio_account_snapshots_account_date
  on folio_account_snapshots (account_id, snapshot_date desc);
