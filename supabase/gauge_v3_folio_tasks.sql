-- Gauge V3 Phase 1 — folio_tasks foundation
--
-- Creates the unified tasks table that will eventually replace folio_items
-- and absorb the gauge_projects.stages jsonb arrays. Phase 1 just creates
-- the table + indexes + RLS; dual-writes from Pip's plan apply land in the
-- same commit so new rows start flowing into folio_tasks immediately
-- without removing anything from folio_items / gauge_projects.stages.
--
-- Future phases:
--   Phase 2: lens system (folio_org_members.default_lens)
--   Phase 3: queue UI built against folio_tasks
--   Phase 4: project templates (gauge_project_templates)
--   Phase 5: Leader view
--   Phase 6: corrections wiring, post-apply account override, AM rollup
--
-- Idempotent: safe to re-run.

create table if not exists folio_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  org_id              uuid,
  account_id          uuid references folio_accounts(id) on delete set null,
  project_id          uuid references gauge_projects(id) on delete set null,
  parent_step_index   integer,                            -- ordering within a discrete project
  title               text not null,
  description         text,
  status              text not null default 'planned'      -- planned | in_progress | blocked | complete
                      check (status in ('planned','in_progress','blocked','complete')),
  task_status         text,                                -- kanban column id for standing projects
  assignee_email      text,
  due_date            date,
  done                boolean not null default false,
  closed_at           timestamptz,
  custom_fields       jsonb not null default '{}'::jsonb,
  source_meeting_id   uuid references folio_meetings(id) on delete set null,
  pip_created_at      timestamptz,                         -- marker for V2 brain post-creation edits
  user_added          boolean not null default false,      -- true when user added (not Pip)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Hot paths
create index if not exists folio_tasks_user_time_idx     on folio_tasks (user_id, created_at desc);
create index if not exists folio_tasks_account_idx       on folio_tasks (account_id) where account_id is not null;
create index if not exists folio_tasks_project_idx       on folio_tasks (project_id) where project_id is not null;
create index if not exists folio_tasks_assignee_due_idx  on folio_tasks (assignee_email, due_date) where done = false;
create index if not exists folio_tasks_open_idx          on folio_tasks (user_id, done, due_date);

-- updated_at trigger
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

-- RLS
alter table folio_tasks enable row level security;

drop policy if exists "tasks_select_own" on folio_tasks;
create policy "tasks_select_own" on folio_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "tasks_insert_own" on folio_tasks;
create policy "tasks_insert_own" on folio_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "tasks_update_own" on folio_tasks;
create policy "tasks_update_own" on folio_tasks
  for update using (auth.uid() = user_id);

drop policy if exists "tasks_delete_own" on folio_tasks;
create policy "tasks_delete_own" on folio_tasks
  for delete using (auth.uid() = user_id);
