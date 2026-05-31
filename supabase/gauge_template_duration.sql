-- Gauge template turnaround time.
-- total_duration_days: how long this project type takes end-to-end.
-- Auto-derives from max stage due_offset_days if not set manually.
-- expected_complete_date: set on real projects when created from a template.

alter table gauge_templates
  add column if not exists total_duration_days integer;

alter table gauge_projects
  add column if not exists total_duration_days integer;

alter table gauge_projects
  add column if not exists expected_complete_date date;
