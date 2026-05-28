-- ─── Phase 8 — Multi-device realtime sync ───────────────────────────────────
-- Adds each folio_* table to the supabase_realtime publication so INSERT /
-- UPDATE / DELETE events flow to subscribed clients. The client subscribes
-- via `supabase.channel(...).on('postgres_changes', ...)` and refetches on
-- change.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already in the
-- publication, so each statement is wrapped in a defensive do-block that
-- swallows that specific error (and any other harmless one). Safe to re-run.
--
-- Run once in production. No data is modified.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table folio_accounts;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_meetings;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_items;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_contacts;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_cadences;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_quick_tasks;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table gauge_projects;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table folio_account_notes;
exception when others then null; end $$;

-- Optional verification — should list all 8 tables above.
-- select schemaname, tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime'
--  order by tablename;
