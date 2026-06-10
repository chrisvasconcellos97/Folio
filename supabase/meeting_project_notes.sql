-- Item 41 — split-screen meeting mode: per-project notes captured during a
-- meeting, keyed by Gauge project id: { [projectId]: noteText }.
-- The general `notes` column stays the freeform blob; this gives Pip clean
-- provenance so a project's notes route action items to THAT project.
-- Applied to production via MCP migration `meeting_project_notes` (June 10 2026).

alter table folio_meetings
  add column if not exists project_notes jsonb default '{}'::jsonb;
