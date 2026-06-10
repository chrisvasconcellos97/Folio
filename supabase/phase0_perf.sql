-- Phase 0 hardening — database performance (June 10 2026)
-- All three applied to production via MCP migrations:
--   rls_initplan_wrap_folio_tables, drop_duplicate_quick_tasks_policy,
--   fk_indexes_folio_tables
-- and folded into canonical schema.sql. Kept for historical reference.

-- 1) RLS initplan wrap — every Folios-table policy now uses
--    (select auth.uid()) / (select auth.email()) so Postgres evaluates the
--    auth function once per query (InitPlan) instead of once per row.
--    (76 auth_rls_initplan advisor lints cleared. Non-Folios tables in the
--    shared project were deliberately left untouched.)

-- 2) Duplicate permissive policy dropped (identical USING, same table+cmd):
drop policy if exists "Users own their quick tasks" on folio_quick_tasks;
--    The org-layered pairs on folio_accounts / folio_org_members / folio_tasks
--    (own-access + org-access) are INTENTIONAL and kept.

-- 3) Foreign-key covering indexes (27) + the drip-question hot path:
create index if not exists idx_folio_meetings_account_id        on folio_meetings(account_id);
create index if not exists idx_folio_account_notes_org_id       on folio_account_notes(org_id);
create index if not exists idx_folio_account_notes_user_id      on folio_account_notes(user_id);
create index if not exists idx_folio_account_updates_gauge_project_id on folio_account_updates(gauge_project_id);
create index if not exists idx_folio_accounts_custom_workspace_id on folio_accounts(custom_workspace_id);
create index if not exists idx_folio_accounts_merged_into        on folio_accounts(merged_into_account_id);
create index if not exists idx_folio_accounts_owner_user_id      on folio_accounts(owner_user_id);
create index if not exists idx_folio_accounts_parent_account_id  on folio_accounts(parent_account_id);
create index if not exists idx_folio_activity_user_id            on folio_activity(user_id);
create index if not exists idx_folio_contact_aliases_contact_id  on folio_contact_aliases(contact_id);
create index if not exists idx_folio_contact_aliases_created_by  on folio_contact_aliases(created_by);
create index if not exists idx_folio_custom_workspaces_org_id    on folio_custom_workspaces(org_id);
create index if not exists idx_folio_custom_workspaces_user_id   on folio_custom_workspaces(user_id);
create index if not exists idx_folio_email_threads_contact_id    on folio_email_threads(contact_id);
create index if not exists idx_folio_orgs_owner_id               on folio_orgs(owner_id);
create index if not exists idx_folio_quick_tasks_account_id      on folio_quick_tasks(account_id);
create index if not exists idx_folio_revenue_history_account_id  on folio_revenue_history(account_id);
create index if not exists idx_folio_shop_metrics_account_id     on folio_shop_metrics(account_id);
create index if not exists idx_folio_tasks_source_meeting_id     on folio_tasks(source_meeting_id);
create index if not exists idx_folio_thread_events_spawned_task  on folio_thread_events(spawned_task_id);
create index if not exists idx_folio_thread_events_user_id       on folio_thread_events(user_id);
create index if not exists idx_gauge_projects_meeting_id         on gauge_projects(meeting_id);
create index if not exists idx_gauge_templates_user_id           on gauge_templates(user_id);
create index if not exists idx_pip_assignment_hints_account_id   on pip_assignment_hints(account_id);
create index if not exists idx_pip_correction_log_account_id     on pip_correction_log(account_id);
create index if not exists idx_pip_promise_log_account_id        on pip_promise_log(account_id);
create index if not exists idx_pip_promise_log_item_id           on pip_promise_log(item_id);
create index if not exists idx_folio_pip_questions_user_source_status on folio_pip_questions(user_id, source, status);
