-- Verify the three "applied by hand" migrations are actually live in prod.
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Read-only — touches no data, makes no changes. Safe to run anytime.
--
-- Every row should read PASS. Any FAIL = that migration never ran; the
-- matching feature is silently inert in prod (no app error, just no-ops).
--   #50 PTO / Away Mode      -> supabase/away_periods.sql
--   #3  Win log              -> (folio_wins table)
--   #2  Team Sheet           -> supabase/team_tracker.sql

with checks as (
  -- #50 PTO / Away Mode --------------------------------------------------
  select 1 as ord, '#50 PTO' as feature, 'folio_away_periods table' as object,
         to_regclass('public.folio_away_periods') is not null as ok
  union all
  select 2, '#50 PTO', 'folio_tasks.follow_up_on_return col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='folio_tasks'
                   and column_name='follow_up_on_return')
  union all
  select 3, '#50 PTO', 'folio_meetings.follow_up_on_return col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='folio_meetings'
                   and column_name='follow_up_on_return')
  -- #3 Win log -----------------------------------------------------------
  union all
  select 4, '#3 Win log', 'folio_wins table',
         to_regclass('public.folio_wins') is not null
  -- #2 Team Sheet (5 cols on gauge_projects) -----------------------------
  union all
  select 5, '#2 Team Sheet', 'gauge_projects.on_team_tracker col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='gauge_projects'
                   and column_name='on_team_tracker')
  union all
  select 6, '#2 Team Sheet', 'gauge_projects.email_thread_url col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='gauge_projects'
                   and column_name='email_thread_url')
  union all
  select 7, '#2 Team Sheet', 'gauge_projects.connection_macro_date col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='gauge_projects'
                   and column_name='connection_macro_date')
  union all
  select 8, '#2 Team Sheet', 'gauge_projects.integration_macro_date col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='gauge_projects'
                   and column_name='integration_macro_date')
  union all
  select 9, '#2 Team Sheet', 'gauge_projects.tracker_exported_at col',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='gauge_projects'
                   and column_name='tracker_exported_at')
)
select feature, object, case when ok then 'PASS' else 'FAIL — run the migration' end as status
from checks
order by ord;

-- One-line summary: how many of the 9 checks passed.
with checks as (
  select to_regclass('public.folio_away_periods') is not null as ok
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='folio_tasks' and column_name='follow_up_on_return')
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='folio_meetings' and column_name='follow_up_on_return')
  union all select to_regclass('public.folio_wins') is not null
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='gauge_projects' and column_name='on_team_tracker')
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='gauge_projects' and column_name='email_thread_url')
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='gauge_projects' and column_name='connection_macro_date')
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='gauge_projects' and column_name='integration_macro_date')
  union all select exists (select 1 from information_schema.columns where table_schema='public' and table_name='gauge_projects' and column_name='tracker_exported_at')
)
select count(*) filter (where ok) || ' / ' || count(*) || ' checks passed' as summary from checks;
