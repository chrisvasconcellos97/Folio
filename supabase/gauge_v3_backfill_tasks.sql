-- Gauge V3 Phase 3 — backfill folio_items + gauge_projects.stages into folio_tasks
--
-- Phase 1 created folio_tasks and wired Pip's plan apply to dual-write. This
-- migration brings existing data over so the new flat task queue (Phase 3)
-- renders something on first load. After this runs:
--   - Every folio_items row exists as a folio_tasks row (project_id null)
--   - Every gauge_projects.stages[] entry exists as a folio_tasks row
--     linked to its parent project via project_id + parent_step_index
--
-- Idempotent: ON CONFLICT (id) DO NOTHING on both passes. Re-runs are safe.
-- Stages with malformed (non-UUID) ids are skipped — they're legacy artifacts.

-- ── Pass 1: folio_items → folio_tasks (loose tasks, project_id null)
insert into folio_tasks (
  id, user_id, account_id, project_id, title,
  due_date, done, closed_at, source_meeting_id, pip_created_at,
  user_added, status, created_at
)
select
  fi.id,
  fi.user_id,
  fi.account_id,
  null::uuid,
  coalesce(nullif(fi.text, ''), '(no title)'),
  fi.due_date,
  coalesce(fi.done, false),
  fi.closed_at,
  fi.source_meeting_id,
  fi.pip_created_at,
  fi.pip_created_at is null,
  case when coalesce(fi.done, false) then 'complete' else 'planned' end,
  coalesce(fi.created_at, now())
from folio_items fi
on conflict (id) do nothing;

-- ── Pass 2: gauge_projects.stages[] → folio_tasks (project tasks)
insert into folio_tasks (
  id, user_id, account_id, project_id, parent_step_index, title,
  assignee_email, due_date, done, closed_at, task_status,
  custom_fields, source_meeting_id, pip_created_at, user_added,
  status, created_at
)
select
  (s.stage_obj->>'id')::uuid,
  gp.user_id,
  coalesce(
    nullif(s.stage_obj->>'account_id', '')::uuid,
    gp.account_id
  ),
  gp.id,
  (s.idx - 1)::int,
  coalesce(nullif(s.stage_obj->>'title', ''), '(no title)'),
  nullif(s.stage_obj->>'assignee', ''),
  nullif(s.stage_obj->>'due_date', '')::date,
  (s.stage_obj->>'completed_at') is not null,
  nullif(s.stage_obj->>'completed_at', '')::timestamptz,
  nullif(s.stage_obj->>'task_status', ''),
  coalesce(s.stage_obj->'custom_fields', '{}'::jsonb),
  nullif(s.stage_obj->>'source_meeting_id', '')::uuid,
  nullif(s.stage_obj->>'pip_created_at', '')::timestamptz,
  s.stage_obj->>'pip_created_at' is null,
  case when (s.stage_obj->>'completed_at') is not null then 'complete'
       else 'planned' end,
  coalesce(
    nullif(s.stage_obj->>'created_at', '')::timestamptz,
    gp.created_at,
    now()
  )
from gauge_projects gp
cross join lateral jsonb_array_elements(
  coalesce(gp.stages, '[]'::jsonb)
) with ordinality s(stage_obj, idx)
where s.stage_obj->>'id' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
on conflict (id) do nothing;
