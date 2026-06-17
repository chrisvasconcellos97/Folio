# Task-Model Unification Plan (folio_tasks canonical) — Chris chose "full unification" 2026-06-17

GOAL: one canonical task store (`folio_tasks`); retire `gauge_projects.stages` as a
write target. DO NOT rush — this touches 174 live task/step objects + ~10 reader/writer
files. Execute as a dedicated, fresh-context effort, staged, each stage validated.

## Live data scope (read 2026-06-17, prod)
- 36 projects · 35 have stage objects · **174 total stage objects**
- folio_tasks: 66 total · only **9** have project_id · 57 standalone
- => the V3 backfill never completed; `stages` is still source-of-truth for project work.

## ⚠️ Stages is OVERLOADED — two shapes (this is the hazard)
- **148 workflow STEPS**: keys `sub_stages` (NESTED), `is_external`, `external_contact_id`,
  `external_contact_name`, `blocked_reason`, `assignee_email`, `completed_at`.
- **~16–26 flat TASKS**: keys `id`, `task_status`, `assignee`, `pip_created_at`,
  `source_meeting_id`, `custom_fields`, `account_id`, `created_at`.
- 159/174 have `completed_at`; 2 have waiting_on; 1 has task_notes.

## Schema gaps on folio_tasks (must add BEFORE migrating, or lose data)
folio_tasks HAS: project_id, parent_step_index, task_status, assignee_email, recipient,
  custom_fields, is_commitment, completed→(done/closed_at), source_meeting_id, pip_created_at.
folio_tasks MISSING (present in steps): `is_external`, `external_contact_id`,
  `external_contact_name`, `blocked_reason`, and a representation for `sub_stages`.
  => DECISION NEEDED: model sub_stages as child folio_tasks via `parent_step_index`
  (flatten, parent index points to the step), or add a sub_stages jsonb. Recommend
  child-rows via parent_step_index (true unification) — but verify the kanban/editor
  can render parent+children from flat rows first.

## Field mapping (stage → folio_tasks), once columns exist
title→title · assignee_email||assignee→assignee_email · due_date→due_date ·
recipient→recipient · task_status→task_status(default 'intake') · account_id→account_id ·
is_commitment→is_commitment · custom_fields→custom_fields · source_meeting_id→source_meeting_id ·
pip_created_at→pip_created_at · created_at→created_at · completed_at→done=true+closed_at ·
is_external/external_contact_id/external_contact_name/blocked_reason→new columns ·
waiting_on/waiting_on_since→same. Dedup: skip (project_id,lower(title)) already in folio_tasks (the 9).

## Execution stages (each its own validated commit; backfill applied via MCP + schema.sql)
1. Add missing columns to folio_tasks (is_external, external_contact_id/name, blocked_reason) — additive, safe.
2. Backfill SQL: explode stages→folio_tasks (parent + sub_stage children via parent_step_index), dedup the 9. Idempotent. Apply to prod, verify counts match (174 → folio_tasks project rows).
3. Switch READERS to folio_tasks by project_id: ProjectStageEditor, StandingBoardView,
   MyQueueView, ProjectStatusUpdate, accountHealth.gatherSignals (stuck detection),
   GaugeView stuck/stage rendering, OverviewTab external-stages, pip.js summarize "tasks under project",
   pipContext project task rendering. (grep `\.stages` across src/ — ~10 sites.)
4. Switch WRITERS off stages: pipPlanApply new_task/update_task, commitStages, ProjectStageEditor edits → folio_tasks.
5. Keep `stages` column as READ-ONLY backup for one release (don't drop yet). Verify UI parity on a real project.
6. Drop stage writes from schema.sql notes; docs/upgrades entry.

## Risk controls
- Back up stages first: `create table gauge_stages_backup_20260617 as select id, stages from gauge_projects;`
- Apply backfill in a transaction; verify per-project task counts before/after.
- Do NOT drop the stages column this pass.
- Stress-bot a project create/edit/complete cycle after the reader switch.
