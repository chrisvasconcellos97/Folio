-- Folios schema — canonical reference. Run in Supabase SQL editor.
-- Includes columns from every incremental migration; safe to re-run
-- (IF NOT EXISTS / DROP-IF-EXISTS throughout).
--
-- This file is the source of truth for the production schema. The
-- per-feature migration files (cadence_hub.sql, workspaces.sql,
-- account_owners.sql, phase1_security.sql, phase3_pip_usage.sql,
-- phase5_indexes.sql, phase5_cascades.sql, etc.) are kept around for
-- historical reference and to apply incremental changes to an already-
-- live DB. A fresh project can run JUST this file plus the optional
-- audit_log.sql, route_builder.sql, pip_facts.sql, pip_account_state.sql,
-- team_org_layer.sql add-ons (those tables are defined here too, but
-- their incremental migrations contain RLS + helper functions worth
-- referencing).

-- ──────────────────────────────────────────────────────────────────────
-- Shared trigger
-- ──────────────────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ──────────────────────────────────────────────────────────────────────
-- Accounts
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users not null,
  name                    text not null,
  revenue                 text,
  revenue_amount          numeric,
  tier                    text check (tier in ('Major', 'Mid', 'Growth')),
  status                  text default 'green' check (status in ('green', 'yellow', 'red')),
  objective               text,
  systems                 jsonb not null default '[]'::jsonb,  -- tools/systems the account uses (approved Pip suggestions)
  next_meeting            date,
  last_meeting            date,
  last_interaction_at     timestamptz,
  pip_account_summary     text,
  pip_account_summary_at  timestamptz,
  region                  text,
  tags                    text[] default '{}',
  serviced_states         text[] default '{}',
  market_scope            text,
  parent_account_id       uuid references folio_accounts,
  account_type            text DEFAULT 'standard',
  account_number          text,
  address                 text,
  lat                     float8,
  lng                     float8,
  agreement_end_date      date,
  scope_summary           text,
  billing_terms           text,
  spend_ytd               numeric,
  owner_user_id           uuid references auth.users(id),
  org_id                  uuid,                                -- FK added after folio_orgs exists
  is_inactive             boolean default false,
  inactivated_at          timestamptz,
  merged_into_account_id  uuid,                                -- self-FK added below
  is_my_department        boolean not null default false,
  -- Health override fields (Pip-computed health is the default; these let users pin).
  status_override         text check (status_override is null or status_override in ('green','yellow','red')),
  status_override_reason  text,
  status_override_at      timestamptz,
  status_override_until   date,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table folio_accounts enable row level security;

drop policy if exists "Users manage own accounts" on folio_accounts;
create policy "Users manage own accounts"
  on folio_accounts for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists folio_accounts_updated_at on folio_accounts;
create trigger folio_accounts_updated_at
  before update on folio_accounts
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- Contacts
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_contacts (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  name       text not null,
  title      text,
  phone      text,
  email      text,
  linkedin   text,
  is_poc     boolean default false,
  is_leader  boolean default false,
  is_primary boolean default false,
  notes      text,
  created_at timestamptz default now()
);

alter table folio_contacts enable row level security;

drop policy if exists "Users manage own contacts" on folio_contacts;
create policy "Users manage own contacts"
  on folio_contacts for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Cadences (declared before folio_meetings so the cadence_id FK resolves)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_cadences (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  account_id    uuid references folio_accounts(id) on delete cascade,
  contact_id    uuid references folio_contacts(id) on delete set null,
  cadence_scope text not null default 'account',
  type          text not null default 'meeting' check (type in ('meeting', 'task')),
  frequency     text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  day_of_week   int check (day_of_week >= 0 and day_of_week <= 6),
  day_of_month  int check (day_of_month >= 1 and day_of_month <= 31),
  meeting_time  text,
  task_title    text,
  notes         text,
  pip_brief     text,
  pip_brief_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table folio_cadences enable row level security;

drop policy if exists "Users manage their own cadences" on folio_cadences;
create policy "Users manage their own cadences"
  on folio_cadences for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists folio_cadences_updated_at on folio_cadences;
create trigger folio_cadences_updated_at
  before update on folio_cadences
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- Meetings
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_meetings (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid references folio_accounts on delete cascade not null,
  user_id        uuid references auth.users not null,
  cadence_id     uuid references folio_cadences(id) on delete set null,
  title          text,
  meeting_date   date,
  meeting_time   text,                 -- HH:MM for scheduled meetings
  method         text check (method is null or method in ('phone', 'email', 'video', 'in_person')),
  status         text default 'summarized' check (status in ('draft', 'summarized', 'scheduled')),
  agenda         text,                 -- optional agenda note for scheduled meetings
  notes          text,
  talking_points text,
  action_items   text,
  commitments    text,
  follow_up_date date,
  rating         integer check (rating between 1 and 5),
  attendees      text[],
  pip_summary    text,
  pip_short_title text,
  pip_email      text,
  pip_tone       text check (pip_tone is null or pip_tone in ('positive','neutral','mixed','negative')),
  plan_applied_at timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table folio_meetings enable row level security;

drop policy if exists "Users manage own meetings" on folio_meetings;
create policy "Users manage own meetings"
  on folio_meetings for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists folio_meetings_updated_at on folio_meetings;
create trigger folio_meetings_updated_at
  before update on folio_meetings
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- Open Items
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_items (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  text       text not null,
  due_date   date,
  owner          text,
  done           boolean default false,
  closed_at      timestamptz,
  is_commitment  boolean not null default false,
  created_at     timestamptz default now(),
  pip_created_at    timestamptz,
  source_meeting_id uuid references folio_meetings on delete set null
);

create index if not exists folio_items_source_meeting_idx on folio_items(source_meeting_id);

alter table folio_items enable row level security;

drop policy if exists "Users manage own items" on folio_items;
create policy "Users manage own items"
  on folio_items for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Gauge V3 — folio_tasks (unified items + tasks home)
-- Phase 1: table + indexes + RLS, dual-write from Pip plan apply.
-- Eventually replaces folio_items and gauge_projects.stages[].
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  org_id              uuid,
  account_id          uuid references folio_accounts(id) on delete set null,
  project_id          uuid references gauge_projects(id) on delete set null,
  parent_step_index   integer,
  title               text not null,
  description         text,
  status              text not null default 'planned'
                      check (status in ('planned','in_progress','blocked','complete')),
  task_status         text,
  assignee_email      text,
  recipient           text,        -- who the task is for / who you'll send to
  due_date            date,
  done                boolean not null default false,
  closed_at           timestamptz,
  is_commitment       boolean not null default false,
  custom_fields       jsonb not null default '{}'::jsonb,
  source_meeting_id   uuid references folio_meetings(id) on delete set null,
  pip_created_at      timestamptz,
  user_added          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists folio_tasks_user_time_idx     on folio_tasks (user_id, created_at desc);
create index if not exists folio_tasks_account_idx       on folio_tasks (account_id) where account_id is not null;
create index if not exists folio_tasks_project_idx       on folio_tasks (project_id) where project_id is not null;
create index if not exists folio_tasks_assignee_due_idx  on folio_tasks (assignee_email, due_date) where done = false;
create index if not exists folio_tasks_open_idx          on folio_tasks (user_id, done, due_date);
create index if not exists folio_tasks_commitment_idx    on folio_tasks (user_id, is_commitment) where is_commitment = true;

create or replace function folio_tasks_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists folio_tasks_touch_updated_at on folio_tasks;
create trigger folio_tasks_touch_updated_at
  before update on folio_tasks
  for each row execute function folio_tasks_touch_updated_at();

alter table folio_tasks enable row level security;

drop policy if exists "tasks_select_own" on folio_tasks;
create policy "tasks_select_own" on folio_tasks for select using (auth.uid() = user_id);

drop policy if exists "tasks_insert_own" on folio_tasks;
create policy "tasks_insert_own" on folio_tasks for insert with check (auth.uid() = user_id);

drop policy if exists "tasks_update_own" on folio_tasks;
create policy "tasks_update_own" on folio_tasks for update using (auth.uid() = user_id);

drop policy if exists "tasks_delete_own" on folio_tasks;
create policy "tasks_delete_own" on folio_tasks for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Quick Tasks
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_quick_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  account_id  uuid references folio_accounts on delete set null,
  title       text not null,
  notes       text,
  done        boolean default false,
  reminder_at timestamptz,
  created_at  timestamptz default now()
);

alter table folio_quick_tasks enable row level security;

drop policy if exists "Users manage own quick tasks" on folio_quick_tasks;
create policy "Users manage own quick tasks"
  on folio_quick_tasks for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Team / Org layer
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid references auth.users not null,
  created_at timestamptz default now()
);
alter table folio_orgs enable row level security;

drop policy if exists "orgs_owner_all" on folio_orgs;
create policy "orgs_owner_all" on folio_orgs
  for all
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Helper functions for org membership lookups (break RLS recursion)
create or replace function folio_user_org_ids()
returns setof uuid
language sql security definer stable set search_path = public
as $$
  select org_id from folio_org_members
  where user_id = auth.uid() and accepted = true
$$;
grant execute on function folio_user_org_ids() to authenticated;

create or replace function folio_user_writable_org_ids()
returns setof uuid
language sql security definer stable set search_path = public
as $$
  select org_id from folio_org_members
  where user_id = auth.uid() and accepted = true and role in ('owner','member')
$$;
grant execute on function folio_user_writable_org_ids() to authenticated;

create table if not exists folio_org_members (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references folio_orgs on delete cascade not null,
  user_id        uuid references auth.users on delete cascade,
  role           text check (role in ('owner','member','leadership')) not null,
  default_lens   text check (default_lens in ('am','leader','admin')) not null default 'am',
  invited_email  text,
  accepted       boolean default false,
  is_inactive    boolean default false,
  inactivated_at timestamptz,
  created_at     timestamptz default now()
);
alter table folio_org_members enable row level security;

create table if not exists folio_account_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references folio_orgs on delete cascade,
  account_id uuid references folio_accounts on delete cascade not null,
  user_id    uuid references auth.users not null,
  notes      text,
  updated_at timestamptz default now(),
  unique (account_id, user_id)
);
alter table folio_account_notes enable row level security;

drop policy if exists "notes_owner" on folio_account_notes;
create policy "notes_owner"
  on folio_account_notes for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists folio_activity (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references folio_orgs on delete cascade,
  user_id    uuid references auth.users not null,
  account_id uuid references folio_accounts on delete cascade,
  event_type text not null,
  payload    jsonb default '{}',
  created_at timestamptz default now()
);
alter table folio_activity enable row level security;

-- Wire folio_accounts.org_id once folio_orgs exists. ALTER is idempotent
-- (constraint name guarded).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'folio_accounts_org_id_fkey'
  ) then
    alter table folio_accounts
      add constraint folio_accounts_org_id_fkey
      foreign key (org_id) references folio_orgs;
  end if;
end $$;

-- Self-FK for the merge pointer. Set-null on delete so a target wipe
-- leaves the absorbed account orphaned-but-listable rather than gone.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'folio_accounts_merged_into_fkey'
  ) then
    alter table folio_accounts
      add constraint folio_accounts_merged_into_fkey
      foreign key (merged_into_account_id) references folio_accounts(id) on delete set null;
  end if;
end $$;

-- See team_org_layer.sql + phase1_security.sql for the full set of
-- member / org-write policies (members_owner_all, members_self_read,
-- members_self_accept, accounts_org_read, accounts_org_write, etc.).

-- ──────────────────────────────────────────────────────────────────────
-- Gauge — Projects + Templates
-- ──────────────────────────────────────────────────────────────────────
create table if not exists gauge_projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  -- Phase 5: set null (was cascade) so completed project history
  -- survives an account delete.
  account_id     uuid references folio_accounts on delete set null,
  account_ids    uuid[] default '{}',
  meeting_id     uuid references folio_meetings on delete set null,
  title          text not null,
  description    text,
  notes          text,
  status         text default 'planned'
                 check (status in ('draft', 'planned', 'in_progress', 'blocked', 'complete', 'on_hold')),
  priority       text default 'medium'
                 check (priority in ('high', 'medium', 'low')),
  due_date       date,
  start_date     date,
  assignee       text,
  stages         jsonb default '[]',
  scope          text default 'personal',
  blocked_reason text,
  requested_at   timestamptz default now(),
  requested_by   text,
  is_standing    boolean default false,
  custom_field_schema  jsonb default '[]',
  task_status_columns  jsonb default '["intake","in_progress","done"]',
  total_duration_days  integer,
  expected_complete_date date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table gauge_projects enable row level security;

drop policy if exists "Gauge owner access" on gauge_projects;
create policy "Gauge owner access"
  on gauge_projects for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Gauge assignee select" on gauge_projects;
create policy "Gauge assignee select"
  on gauge_projects for select
  using (assignee = auth.email());

-- The full assignee-update policy (with gauge_owner_unchanged guard) lives
-- in phase1_security.sql. Re-running that file installs it on top.

drop trigger if exists gauge_projects_updated_at on gauge_projects;
create trigger gauge_projects_updated_at
  before update on gauge_projects
  for each row execute function update_updated_at();

create table if not exists gauge_templates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  org_id              uuid,
  title               text not null,
  description         text,
  stages              jsonb default '[]',
  is_standing         boolean default false,
  custom_field_schema jsonb default '[]',
  task_status_columns jsonb default '["intake","in_progress","done"]',
  total_duration_days integer,
  created_at          timestamptz default now()
);

alter table gauge_templates enable row level security;
drop policy if exists "Template owner access" on gauge_templates;
create policy "Template owner access"
  on gauge_templates for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Account updates (Revenue-impact Update Calendar)
-- ──────────────────────────────────────────────────────────────────────
-- Manual log of things that could affect revenue on an account (catalog
-- pushes, pricing changes, integrations, product launches, training,
-- promos, external events). Surfaced as an "Updates" tab on the account
-- detail and as small ticks on the revenue sparkline so a MoM dip can
-- be root-caused. See supabase/account_updates.sql for the migration.
create table if not exists folio_account_updates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  org_id            uuid,
  account_id        uuid references folio_accounts on delete cascade not null,
  update_date       date not null,
  update_type       text not null check (update_type in (
                      'catalog', 'pricing', 'integration', 'product_launch',
                      'training', 'promo', 'external_event', 'other'
                    )),
  title             text not null,
  description       text,
  owner             text,
  observed_impact   text check (observed_impact is null or observed_impact in (
                      'positive', 'negative', 'mixed', 'unknown'
                    )),
  gauge_project_id  uuid references gauge_projects on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table folio_account_updates enable row level security;
drop policy if exists "Users manage own updates" on folio_account_updates;
create policy "Users manage own updates"
  on folio_account_updates for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists folio_account_updates_account_idx
  on folio_account_updates(account_id, update_date desc);
create index if not exists folio_account_updates_user_idx
  on folio_account_updates(user_id, update_date desc);

drop trigger if exists folio_account_updates_updated_at on folio_account_updates;
create trigger folio_account_updates_updated_at
  before update on folio_account_updates
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- Pip usage tracking (Phase 3) — append-only per-call cost log
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_pip_usage (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  endpoint                text not null,
  mode                    text,
  model                   text not null,
  input_tokens            integer not null default 0,
  output_tokens           integer not null default 0,
  cache_read_tokens       integer not null default 0,
  cache_creation_tokens   integer not null default 0,
  cost_micro_cents        bigint  not null default 0,
  created_at              timestamptz not null default now()
);

alter table folio_pip_usage enable row level security;

drop policy if exists "pip_usage_owner_select" on folio_pip_usage;
create policy "pip_usage_owner_select" on folio_pip_usage
  for select using (auth.uid() = user_id);

drop policy if exists "pip_usage_owner_insert" on folio_pip_usage;
create policy "pip_usage_owner_insert" on folio_pip_usage
  for insert with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip memory — facts + account-state cache
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_pip_facts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fact        text not null,
  source      text not null default 'user_explicit',
  active      boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table folio_pip_facts enable row level security;

drop policy if exists "facts_owner_select" on folio_pip_facts;
create policy "facts_owner_select" on folio_pip_facts
  for select using (auth.uid() = user_id);

drop policy if exists "facts_owner_write" on folio_pip_facts;
create policy "facts_owner_write" on folio_pip_facts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists folio_pip_account_state (
  account_id          uuid primary key references folio_accounts(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  state_prose         text not null,
  health_signal       text,
  momentum            text,
  risk_flags          text[],
  generated_at        timestamptz not null default now(),
  stale_at            timestamptz,
  lessons_learned     text,
  last_compression_at timestamptz
);
alter table folio_pip_account_state enable row level security;

drop policy if exists "state_owner_select" on folio_pip_account_state;
create policy "state_owner_select" on folio_pip_account_state
  for select using (auth.uid() = user_id);

drop policy if exists "state_owner_write" on folio_pip_account_state;
create policy "state_owner_write" on folio_pip_account_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip assignment hints — learned defaults for who gets which task on
-- each account. Populated whenever the user overrides Pip's suggested
-- assignee in the summarize preview. See pip_assignment_hints.sql.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pip_assignment_hints (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  account_id      uuid references folio_accounts on delete cascade,
  task_pattern    text not null,
  assignee_email  text not null,
  created_at      timestamptz default now()
);
create index if not exists pip_assignment_hints_user_account_idx
  on pip_assignment_hints(user_id, account_id);
alter table pip_assignment_hints enable row level security;
drop policy if exists "Users manage own hints" on pip_assignment_hints;
create policy "Users manage own hints"
  on pip_assignment_hints for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip correction log (V2 brain foundation) — every disagreement the user
-- has with Pip's output. Read back into the next summarize prompt so Pip
-- stops repeating the same misreads. See pip_correction_log.sql.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pip_correction_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  account_id        uuid references folio_accounts on delete cascade,
  meeting_id        uuid references folio_meetings on delete set null,
  correction_type   text not null check (correction_type in (
    'summary_edit', 'rejected_row', 'item_text_edit', 'task_text_edit', 'missed_item', 'routed_account_changed'
  )),
  original_value    jsonb,
  corrected_value   jsonb,
  reason            text,
  created_at        timestamptz default now()
);
create index if not exists pip_correction_log_user_account_idx
  on pip_correction_log(user_id, account_id, created_at desc);
create index if not exists pip_correction_log_meeting_idx
  on pip_correction_log(meeting_id);
alter table pip_correction_log enable row level security;
drop policy if exists "Users manage own corrections" on pip_correction_log;
create policy "Users manage own corrections"
  on pip_correction_log for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip correction log archive — rows older than 60 days are moved here
-- after compression so the live table stays small. See pip_lessons_learned.sql.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pip_correction_log_archive (
  like pip_correction_log including all
);
alter table pip_correction_log_archive enable row level security;
drop policy if exists "Users manage own archived corrections" on pip_correction_log_archive;
create policy "Users manage own archived corrections"
  on pip_correction_log_archive for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip glossary — durable user-taught terms injected into every summarize
-- and brief call. Org-scoped sharing; account_id-scoped for per-account
-- knowledge. See pip_glossary.sql.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists pip_glossary (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  org_id        uuid references folio_orgs,
  account_id    uuid references folio_accounts on delete cascade,
  term          text not null,
  definition    text not null,
  preserve_case boolean default true,
  aliases       text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

create index if not exists pip_glossary_user_idx    on pip_glossary(user_id)    where deleted_at is null;
create index if not exists pip_glossary_org_idx     on pip_glossary(org_id)     where deleted_at is null;
create index if not exists pip_glossary_account_idx on pip_glossary(account_id) where deleted_at is null;

alter table pip_glossary enable row level security;
drop policy if exists "Users manage own glossary" on pip_glossary;
create policy "Users manage own glossary"
  on pip_glossary for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists pip_glossary_updated_at on pip_glossary;
create trigger pip_glossary_updated_at
  before update on pip_glossary
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- June 2026 additions — folded in so schema.sql stays canonical. These
-- previously lived only in per-feature migrations (folio_user_profile.sql,
-- entity_detection.sql, folio_meeting_themes.sql, folio_contacts_nickname.sql,
-- stakeholder_layer.sql, pip_drip_questions.sql, folio_tasks_org_read.sql).
-- All idempotent.
-- ──────────────────────────────────────────────────────────────────────

-- folio_meetings: Pip-extracted one-word theme tag.
alter table folio_meetings add column if not exists theme text;
create index if not exists folio_meetings_theme_idx
  on folio_meetings(user_id, theme, meeting_date) where theme is not null;

-- folio_cadences: global task cadence (account_id null, is_global true → all accounts).
alter table folio_cadences add column if not exists is_global boolean not null default false;
create index if not exists folio_cadences_is_global_idx
  on folio_cadences(user_id) where is_global = true;

-- folio_contacts: nickname + stakeholder/relationship layer.
alter table folio_contacts add column if not exists nickname text;
alter table folio_contacts add column if not exists relationship_role text
  check (relationship_role is null or relationship_role in ('champion','blocker','neutral','unknown'));
alter table folio_contacts add column if not exists relationship_note text;

-- Pip onboarding profile + question queue.
create table if not exists folio_user_profile (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null unique,
  org_id             uuid,
  role_title         text,
  company_name       text,
  industry           text,
  portfolio_shape    text,
  primary_goal       text,
  reporting_to       text,
  working_style      text,
  kpis               text,
  profile_prose      text,
  prose_generated_at timestamptz,
  completeness       integer default 0,
  onboarding_status  text default 'pending'
                     check (onboarding_status in ('pending','in_progress','done','skipped')),
  pip_questions_paused boolean not null default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table folio_user_profile add column if not exists pip_questions_paused boolean not null default false;
alter table folio_user_profile enable row level security;
drop policy if exists "User profile owner access" on folio_user_profile;
create policy "User profile owner access" on folio_user_profile for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists folio_user_profile_updated_at on folio_user_profile;
create trigger folio_user_profile_updated_at before update on folio_user_profile
  for each row execute function update_updated_at();

create table if not exists folio_pip_questions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  question_text    text not null,
  category         text check (category in ('role','company','portfolio','working_style','goals','gap','terminology')),
  slot             text,
  source           text default 'bank' check (source in ('bank','pip_generated','gap_observed')),
  priority         integer default 5,
  status           text default 'queued' check (status in ('queued','asked','answered','skipped','dismissed')),
  answer_text      text,
  trigger_context  text,
  suggestion       jsonb,  -- structured intent: { type, account_id?, contact_id?, term? }
  asked_at         timestamptz,
  answered_at      timestamptz,
  created_at       timestamptz default now()
);
alter table folio_pip_questions enable row level security;
drop policy if exists "Pip questions owner access" on folio_pip_questions;
create policy "Pip questions owner access" on folio_pip_questions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists folio_user_profile_user_id_idx on folio_user_profile(user_id);
create index if not exists folio_pip_questions_user_id_status_idx on folio_pip_questions(user_id, status);

-- Contact aliases for entity detection. user_id added so SOLO users (no org)
-- get per-user aliases instead of a shared null-org pool. See entity_detection.sql.
create table if not exists folio_contact_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references folio_orgs(id) on delete cascade,
  user_id uuid references auth.users(id),
  contact_id uuid references folio_contacts(id) on delete cascade,
  alias text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table folio_contact_aliases add column if not exists user_id uuid references auth.users(id);
alter table folio_contact_aliases enable row level security;
drop policy if exists "org members can read aliases"   on folio_contact_aliases;
drop policy if exists "org members can insert aliases"  on folio_contact_aliases;
drop policy if exists "alias creator can delete"        on folio_contact_aliases;
drop policy if exists "aliases_read"   on folio_contact_aliases;
drop policy if exists "aliases_insert" on folio_contact_aliases;
drop policy if exists "aliases_delete" on folio_contact_aliases;
-- Read/insert: an org member sees the org's aliases; a solo user sees their own.
create policy "aliases_read" on folio_contact_aliases for select using (
  (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
  or (org_id is null and user_id = auth.uid())
);
create policy "aliases_insert" on folio_contact_aliases for insert with check (
  (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
  or (org_id is null and user_id = auth.uid())
);
-- Delete: the creator, or any org member for shared org aliases.
create policy "aliases_delete" on folio_contact_aliases for delete using (
  created_by = auth.uid()
  or (org_id is null and user_id = auth.uid())
  or (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
);
create index if not exists folio_contact_aliases_org_alias on folio_contact_aliases(org_id, lower(alias));
create index if not exists folio_contact_aliases_user_idx  on folio_contact_aliases(user_id) where user_id is not null;

-- folio_tasks org-read — org peers can read each other's tasks (leadership +
-- teammate drill-in). See folio_tasks_org_read.sql for rationale.
create or replace function folio_org_peer_user_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select distinct them.user_id from folio_org_members me
  join folio_org_members them on them.org_id = me.org_id
  where me.user_id = auth.uid() and me.accepted = true and them.accepted = true and them.user_id is not null
$$;
grant execute on function folio_org_peer_user_ids() to authenticated;
drop policy if exists "tasks_org_peer_read" on folio_tasks;
create policy "tasks_org_peer_read" on folio_tasks for select
  using (user_id in (select folio_org_peer_user_ids()));

-- ──────────────────────────────────────────────────────────────────────
-- Audit log (optional security feature)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_audit_log (
  id         uuid    default gen_random_uuid() primary key,
  user_id    uuid    references auth.users(id) on delete cascade,
  event_type text    not null,
  table_name text,
  record_id  uuid,
  metadata   jsonb,
  created_at timestamp with time zone default now()
);
alter table folio_audit_log enable row level security;

drop policy if exists "Users can read own audit log" on folio_audit_log;
create policy "Users can read own audit log"
  on folio_audit_log for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own audit log" on folio_audit_log;
create policy "Users can insert own audit log"
  on folio_audit_log for insert with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Route builder
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_routes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  date        date,
  stops       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
alter table folio_routes enable row level security;

drop policy if exists "Users manage their own routes" on folio_routes;
create policy "Users manage their own routes"
  on folio_routes for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Observability — client-side error capture (Phase 6)
-- See phase6_observability.sql for full rationale.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists folio_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  org_id      uuid,
  error_type  text not null,           -- 'react' | 'network' | 'pip' | 'unhandled' | 'rejection'
  message     text not null,
  stack       text,
  source_url  text,
  user_agent  text,
  context     jsonb,
  resolved    boolean default false,
  created_at  timestamptz default now()
);

alter table folio_errors enable row level security;

drop policy if exists "errors_owner_select" on folio_errors;
create policy "errors_owner_select" on folio_errors
  for select using (auth.uid() = user_id);

drop policy if exists "errors_owner_insert" on folio_errors;
create policy "errors_owner_insert" on folio_errors
  for insert with check (auth.uid() = user_id);

drop policy if exists "errors_owner_update" on folio_errors;
create policy "errors_owner_update" on folio_errors
  for update using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- Indexes — hot paths (Phase 5)
-- See phase5_indexes.sql for the canonical list with per-query
-- justifications. Mirrored here so a from-scratch run picks them up.
-- ──────────────────────────────────────────────────────────────────────
create index if not exists folio_accounts_user_id_idx          on folio_accounts(user_id);
create index if not exists folio_accounts_parent_id_idx        on folio_accounts(parent_account_id);
create index if not exists idx_accounts_org_id                 on folio_accounts(org_id);

create index if not exists folio_contacts_account_id_idx       on folio_contacts(account_id);
create index if not exists folio_contacts_user_id_idx          on folio_contacts(user_id);

create index if not exists folio_cadences_account_id_idx       on folio_cadences(account_id);
create index if not exists folio_cadences_user_id_idx          on folio_cadences(user_id);

create index if not exists folio_meetings_cadence_id_idx       on folio_meetings(cadence_id);
create index if not exists folio_meetings_status_idx           on folio_meetings(status);
create index if not exists folio_meetings_account_date_idx     on folio_meetings(account_id, meeting_date desc);
create index if not exists folio_meetings_user_date_idx        on folio_meetings(user_id, meeting_date desc);

create index if not exists folio_items_account_done_idx        on folio_items(account_id, done);
create index if not exists folio_items_user_done_idx           on folio_items(user_id, done);

create index if not exists folio_quick_tasks_user_done_idx     on folio_quick_tasks(user_id, done);
create index if not exists folio_quick_tasks_account_id_idx    on folio_quick_tasks(account_id);

create index if not exists gauge_projects_user_id_idx          on gauge_projects(user_id);
create index if not exists gauge_projects_account_id_idx       on gauge_projects(account_id);
create index if not exists gauge_projects_assignee_idx         on gauge_projects(assignee);

create index if not exists folio_account_notes_user_id_idx     on folio_account_notes(user_id);
create index if not exists idx_account_notes_key               on folio_account_notes(account_id, user_id);

create index if not exists folio_activity_account_id_idx       on folio_activity(account_id, created_at desc);
create index if not exists idx_activity_org_id                 on folio_activity(org_id, created_at desc);

create index if not exists idx_org_members_user_id             on folio_org_members(user_id);
create index if not exists idx_org_members_org_id              on folio_org_members(org_id);

create index if not exists folio_pip_usage_user_time_idx       on folio_pip_usage(user_id, created_at desc);
create index if not exists folio_errors_user_time_idx          on folio_errors(user_id, created_at desc);
create index if not exists folio_errors_unresolved_idx         on folio_errors(user_id, resolved) where resolved = false;
create index if not exists folio_pip_facts_user_active         on folio_pip_facts(user_id) where active = true;
create index if not exists folio_pip_account_state_user        on folio_pip_account_state(user_id);
create index if not exists folio_pip_account_state_stale       on folio_pip_account_state(stale_at);

create index if not exists folio_audit_log_user_time_idx       on folio_audit_log(user_id, created_at desc);
create index if not exists folio_audit_log_created_at_idx      on folio_audit_log(created_at desc);
create index if not exists folio_routes_user_id_idx            on folio_routes(user_id);

create index if not exists folio_accounts_is_inactive_idx      on folio_accounts(is_inactive);
create index if not exists folio_org_members_is_inactive_idx   on folio_org_members(is_inactive);

-- ──────────────────────────────────────────────────────────────────────
-- Account merge — atomic re-parent + soft-archive of source. See
-- supabase/inactive_and_merge.sql for the canonical migration + a
-- manual-test plan.
-- ──────────────────────────────────────────────────────────────────────
create or replace function folio_merge_accounts(source_id uuid, target_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_row folio_accounts%rowtype;
  target_row folio_accounts%rowtype;
  moved      integer := 0;
  bumped     integer;
begin
  if source_id is null or target_id is null then
    raise exception 'source and target are required';
  end if;
  if source_id = target_id then
    raise exception 'cannot merge an account into itself';
  end if;

  select * into source_row from folio_accounts where id = source_id;
  if not found then raise exception 'source account not found or not visible'; end if;
  select * into target_row from folio_accounts where id = target_id;
  if not found then raise exception 'target account not found or not visible'; end if;

  if (source_row.account_type in ('internal_team','partner')
      or target_row.account_type in ('internal_team','partner'))
     and coalesce(source_row.account_type, 'standard') <> coalesce(target_row.account_type, 'standard') then
    raise exception 'cannot merge across workspace types';
  end if;

  update folio_meetings      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_items         set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_contacts      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_cadences      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_account_notes set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_activity      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  delete from folio_pip_account_state where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_quick_tasks   set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update gauge_projects      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update gauge_projects
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_accounts
     set is_inactive            = true,
         inactivated_at         = now(),
         merged_into_account_id = target_id,
         updated_at             = now()
   where id = source_id;

  return moved;
end;
$$;

grant execute on function folio_merge_accounts(uuid, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- Promise completion ledger (account_health.sql migration)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pip_promise_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  account_id        uuid references folio_accounts on delete cascade,
  item_id           uuid references folio_items   on delete set null,
  item_text         text not null,
  due_date          date,
  days_to_complete  integer,
  closed_at         timestamptz default now(),
  created_at        timestamptz default now()
);

alter table pip_promise_log enable row level security;
create policy "Users manage own promise log"
  on pip_promise_log for all
  using (auth.uid() = user_id);

create index if not exists pip_promise_log_user_account_idx
  on pip_promise_log(user_id, account_id);

-- ──────────────────────────────────────────────────────────────────────
-- Pip Tier A — daily account state snapshots
-- One row per (user_id, account_id, snapshot_date). Computed client-side
-- once per day from health signals, items, and Gauge project data.
-- Foundation for Pip's cross-portfolio intelligence.
-- ──────────────────────────────────────────────────────────────────────
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
