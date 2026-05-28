-- Gauge — Standing Projects + Custom Columns + Admin Queue migration
-- Safe to run multiple times (IF NOT EXISTS throughout).
--
-- Background: the existing Gauge model treats every project as a discrete
-- start→stages→complete workflow. This adds a "standing" mode for never-
-- ending request queues (e.g. shop NDA integrations rolling in over time),
-- with per-project custom columns so any team can model its own intake
-- process inside Gauge.
--
-- ─── Adds to `gauge_projects` ─────────────────────────────────────────
--   * `is_standing`           — boolean flag. true = never-ending request
--                               queue (board view). false = discrete
--                               linear stage view (current behavior).
--   * `custom_field_schema`   — jsonb array of column defs each task
--                               carries. Shape: [{ key, label, type, options?, builtin? }]
--                               Types (v1): text, longtext, number, date,
--                               dropdown (with options), person (org member
--                               email), checkbox, url.
--                               "Bones" defaults seeded client-side from
--                               src/lib/gaugeFields.js (Priority, Owner,
--                               Submission Date, Due Date, Description,
--                               Related Link). User can add or remove.
--   * `task_status_columns`   — jsonb array of kanban-column ids for
--                               standing projects. Default
--                               ["intake","in_progress","done"]. Per-task
--                               value lives at `task.task_status`.
--
-- ─── Per-task additions inside the existing `stages` jsonb array ─────
-- The DB column name `stages` stays for backwards compat — only the
-- user-facing label flips to "tasks". Each task object inside the array
-- can carry these new keys (all optional; readers fall back gracefully):
--   * `custom_fields` (object) — values keyed to `custom_field_schema`
--   * `account_id`    (uuid)   — optional account this task belongs to
--                                (e.g. one shop in a standing LKQ-style
--                                integration queue)
--   * `task_status`   (text)   — standing-project kanban column id
--                                (intake / in_progress / done — or any
--                                user-defined value from task_status_columns)
--   * `created_at`    (text)   — ISO timestamp; "Submission Date" bones
--                                field reads from here
--
-- The existing `completed_at` flag on each task keeps its done/not-done
-- semantics. For discrete projects nothing changes. For standing projects
-- the kanban "done" column + `completed_at` are kept in sync client-side.
--
-- ─── RLS ─────────────────────────────────────────────────────────────
-- No new policy required. gauge_projects already has owner + assignee
-- policies in place; assigning a task to a member doesn't change the
-- row's owner, and the admin's "My Queue" view reads via the existing
-- assignee select policy + by digging into the stages jsonb array.

alter table gauge_projects add column if not exists is_standing         boolean default false;
alter table gauge_projects add column if not exists custom_field_schema jsonb   default '[]';
alter table gauge_projects add column if not exists task_status_columns jsonb   default '["intake","in_progress","done"]';

-- Helpful index for the future "tasks assigned to me" lookup. Cheap because
-- gauge_projects is a small table per user; postgres can scan stages jsonb
-- per row without indexing. If volume grows the assignee_email values
-- inside stages[*] could be promoted to a side table, but v1 keeps it in
-- the existing jsonb to avoid a schema split.

create index if not exists gauge_projects_is_standing_idx on gauge_projects(is_standing);
