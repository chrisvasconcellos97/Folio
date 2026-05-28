-- Phase 5 — Hot-path index coverage.
--
-- All entries use IF NOT EXISTS and are additive. Safe to re-run.
-- Run manually in Supabase SQL editor.
--
-- Each index below is justified by a real query path in the app:
--   * folio_items(account_id, done)         — AccountDetail "open items" filter
--   * folio_items(user_id, done)            — global "open items" rollups
--   * folio_contacts(account_id)            — every AccountDetail load
--   * folio_cadences(account_id)            — CadenceTab / CadenceView per account
--   * folio_cadences(user_id)               — global cadence calendar load
--   * folio_quick_tasks(user_id, done)      — main page tray + Pip "show me tasks"
--   * folio_quick_tasks(account_id)         — account-scoped task lookups (nullable FK)
--   * folio_meetings(account_id, meeting_date desc)
--                                            — meeting lists per account, sorted
--   * folio_meetings(user_id, meeting_date desc)
--                                            — "meetings this week" calendar / brief
--   * folio_accounts(user_id)               — every list view (RLS-implicit)
--   * folio_accounts(parent_account_id)     — sub-account / shops rollup
--   * gauge_projects(user_id)               — "My queue"
--   * gauge_projects(account_id)            — Projects tab on account
--   * gauge_projects(assignee)              — assignee RLS read path
--   * folio_account_notes(user_id)          — per-user private notes load
--   * folio_activity(account_id, created_at desc)
--                                            — recent-activity by account
--   * folio_audit_log(user_id, created_at desc)
--                                            — security-events page (per user)

-- ─── folio_items ─────────────────────────────────────────────────────────
create index if not exists folio_items_account_done_idx
  on folio_items(account_id, done);
create index if not exists folio_items_user_done_idx
  on folio_items(user_id, done);

-- ─── folio_contacts ──────────────────────────────────────────────────────
create index if not exists folio_contacts_account_id_idx
  on folio_contacts(account_id);
create index if not exists folio_contacts_user_id_idx
  on folio_contacts(user_id);

-- ─── folio_cadences ──────────────────────────────────────────────────────
create index if not exists folio_cadences_account_id_idx
  on folio_cadences(account_id);
create index if not exists folio_cadences_user_id_idx
  on folio_cadences(user_id);

-- ─── folio_quick_tasks ───────────────────────────────────────────────────
create index if not exists folio_quick_tasks_user_done_idx
  on folio_quick_tasks(user_id, done);
create index if not exists folio_quick_tasks_account_id_idx
  on folio_quick_tasks(account_id);

-- ─── folio_meetings ──────────────────────────────────────────────────────
create index if not exists folio_meetings_account_date_idx
  on folio_meetings(account_id, meeting_date desc);
create index if not exists folio_meetings_user_date_idx
  on folio_meetings(user_id, meeting_date desc);

-- ─── folio_accounts ──────────────────────────────────────────────────────
create index if not exists folio_accounts_user_id_idx
  on folio_accounts(user_id);
create index if not exists folio_accounts_parent_id_idx
  on folio_accounts(parent_account_id);

-- ─── gauge_projects ──────────────────────────────────────────────────────
create index if not exists gauge_projects_user_id_idx
  on gauge_projects(user_id);
create index if not exists gauge_projects_account_id_idx
  on gauge_projects(account_id);
create index if not exists gauge_projects_assignee_idx
  on gauge_projects(assignee);

-- ─── folio_account_notes ────────────────────────────────────────────────
create index if not exists folio_account_notes_user_id_idx
  on folio_account_notes(user_id);

-- ─── folio_activity ─────────────────────────────────────────────────────
create index if not exists folio_activity_account_id_idx
  on folio_activity(account_id, created_at desc);

-- ─── folio_audit_log ────────────────────────────────────────────────────
create index if not exists folio_audit_log_user_time_idx
  on folio_audit_log(user_id, created_at desc);
