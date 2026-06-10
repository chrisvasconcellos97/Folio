-- Game Plan Phase 1.4 — waiting-on layer (June 10 2026)
-- First-class "blocked on [person] since [date]" on tasks and projects.
-- "Who's holding the ball" was the untracked dimension behind stalled
-- projects (the supplier-happiness killer). Applied to production via MCP
-- migration `waiting_on_layer`; folded into canonical schema.sql.

alter table folio_tasks
  add column if not exists waiting_on text,
  add column if not exists waiting_on_since date;

alter table gauge_projects
  add column if not exists waiting_on text,
  add column if not exists waiting_on_since date;
