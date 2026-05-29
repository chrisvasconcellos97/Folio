-- Allow 'draft' as a status value on gauge_projects so partially-built
-- projects can be saved without exposing them as real work.
alter table gauge_projects
  drop constraint if exists gauge_projects_status_check;
alter table gauge_projects
  add constraint gauge_projects_status_check
  check (status in ('draft', 'planned', 'in_progress', 'blocked', 'complete', 'on_hold'));
