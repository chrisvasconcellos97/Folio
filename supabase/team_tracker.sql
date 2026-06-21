-- Team Sheet (Tuesday request tracker) — Phase 2 #2.
-- Folios is the MASTER of the team request tracker; the team's Excel sheet is an
-- OUTPUT. A "request" is a Gauge project, so the tracker is a LENS over
-- gauge_projects plus these few tracker-specific fields (no parallel table —
-- that would recreate the two-system drift this feature exists to kill).
--
-- DATA LINE (locked by Chris, June 21 2026): there is deliberately NO shop_count
-- column. The sheet's "# of Shops" is quantitative OEC business data and must
-- never live in Folios; the export emits an empty cell and Chris fills it in
-- Excel. Do not add a shop count here. See docs/data-handling.md.

alter table gauge_projects add column if not exists on_team_tracker boolean default false;
alter table gauge_projects add column if not exists email_thread_url text;
alter table gauge_projects add column if not exists connection_macro_date date;
alter table gauge_projects add column if not exists integration_macro_date date;
-- Stamped each time a project's row is copied to the sheet; drives the
-- "changed since last export" (dirty) detection that powers the sync nudge.
alter table gauge_projects add column if not exists tracker_exported_at timestamptz;

-- Partial index: the Team Sheet view + Home nudge only ever scan flagged rows.
create index if not exists idx_gauge_projects_team_tracker
  on gauge_projects (user_id) where on_team_tracker;
