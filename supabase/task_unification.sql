-- ──────────────────────────────────────────────────────────────────────
-- TASK-MODEL UNIFICATION (June 2026) — folio_tasks becomes the single
-- canonical task store; gauge_projects.stages is retired as a write target
-- and frozen as a read-only backup. See supabase/task_unification_plan.md.
--
-- Applied to prod via Supabase MCP in three migrations (folded here for a
-- reproducible fresh-rebuild). Live scope at migration time: 36 projects /
-- 174 stage objects (all sub_stages empty) / 66 folio_tasks (9 already
-- project-linked, none duplicating a stage).
-- ──────────────────────────────────────────────────────────────────────

-- Stage 1 — snapshot the stages array before touching anything.
create table if not exists gauge_stages_backup_20260617 as
  select id as project_id, user_id, title, stages, now() as backed_up_at
  from gauge_projects;

-- Stage 2 — columns folio_tasks needs to hold every gauge-stage field.
alter table folio_tasks
  add column if not exists is_external           boolean not null default false,
  add column if not exists external_contact_id   uuid,      -- references a contact; no FK (provenance, survives contact delete)
  add column if not exists external_contact_name text,
  add column if not exists blocked_reason        text,      -- non-null => task/stage is blocked
  add column if not exists sub_stages            jsonb not null default '[]'::jsonb,  -- nested checklist [{title, completed_at}]
  add column if not exists sort_order            integer;   -- preserves stage order within a project (drag-reorder)
create index if not exists folio_tasks_project_order_idx
  on folio_tasks (project_id, sort_order) where project_id is not null;

-- Stage 3 — explode stages -> folio_tasks (idempotent dedup on (project_id, lower(title))).
-- stages-the-column is left intact as a frozen backup.
insert into folio_tasks (
  user_id, org_id, account_id, project_id, parent_step_index,
  title, description, status, task_status, assignee_email, recipient, due_date,
  done, closed_at, is_commitment, custom_fields, source_meeting_id,
  pip_created_at, user_added, created_at,
  is_external, external_contact_id, external_contact_name, blocked_reason,
  sub_stages, sort_order, waiting_on, waiting_on_since, task_notes
)
select
  p.user_id,
  null::uuid,
  coalesce(nullif(st->>'account_id','')::uuid, p.account_id),
  p.id,
  null::int,
  st->>'title',
  nullif(st->'custom_fields'->>'description',''),
  case
    when nullif(st->>'completed_at','') is not null then 'complete'
    when st->>'blocked_reason' is not null then 'blocked'
    else 'planned'
  end,
  coalesce(nullif(st->>'task_status',''),
           case when nullif(st->>'completed_at','') is not null then 'done' else 'intake' end),
  coalesce(nullif(st->>'assignee_email',''), nullif(st->>'assignee','')),
  nullif(st->>'recipient',''),
  coalesce(nullif(st->>'due_date','')::date, nullif(st->'custom_fields'->>'due_date','')::date),
  (nullif(st->>'completed_at','') is not null),
  nullif(st->>'completed_at','')::timestamptz,
  coalesce((st->>'is_commitment')::boolean, false),
  coalesce(st->'custom_fields', '{}'::jsonb),
  nullif(st->>'source_meeting_id','')::uuid,
  nullif(st->>'pip_created_at','')::timestamptz,
  false,
  coalesce(nullif(st->>'created_at','')::timestamptz, p.created_at, now()),
  coalesce((st->>'is_external')::boolean, false),
  nullif(st->>'external_contact_id','')::uuid,
  nullif(st->>'external_contact_name',''),
  st->>'blocked_reason',
  coalesce(st->'sub_stages', '[]'::jsonb),
  (s.ordinality - 1)::int,
  nullif(st->>'waiting_on',''),
  nullif(st->>'waiting_on_since','')::date,
  coalesce(st->'task_notes', '[]'::jsonb)
from gauge_projects p,
     lateral jsonb_array_elements(coalesce(p.stages,'[]'::jsonb)) with ordinality s(value, ordinality),
     lateral (select s.value as st) v
where st->>'title' is not null
  and not exists (
    select 1 from folio_tasks ft
    where ft.project_id = p.id
      and lower(trim(ft.title)) = lower(trim(st->>'title'))
  );
