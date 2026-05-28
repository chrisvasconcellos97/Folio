-- Phase 5 — FK cascade adjustments.
--
-- Run manually in Supabase SQL editor. Safe to re-run (drop-if-exists +
-- re-add). NO DESTRUCTIVE OPS — every change here only adjusts ON DELETE
-- behavior on existing FKs, not data.
--
-- ──────────────────────────────────────────────────────────────────────
-- CHANGE 1 — gauge_projects.account_id: cascade → set null
-- ──────────────────────────────────────────────────────────────────────
-- Today: delete an account → every project on that account silently
-- vanishes. This loses commitment / delivery history that Folios brief-me
-- and Pip both lean on for "what did we ship for X". A project with no
-- account is still meaningful (it's tracked work; the link is just an
-- attribution). `set null` preserves the row, and `account_ids` (the
-- multi-account array) still narrates which other accounts it touched.
--
-- Why this is safe: gauge_projects is owner-RLS (user_id), so the user
-- still sees their orphaned projects after an account delete. The UI's
-- "by account" filter shows nothing for the deleted id, but "My Queue"
-- / "All Projects" still surface the work.

alter table gauge_projects
  drop constraint if exists gauge_projects_account_id_fkey;

alter table gauge_projects
  add constraint gauge_projects_account_id_fkey
  foreign key (account_id) references folio_accounts(id) on delete set null;

-- ──────────────────────────────────────────────────────────────────────
-- WHAT WE INTENTIONALLY DO NOT CHANGE (documented)
-- ──────────────────────────────────────────────────────────────────────
--
-- 1. auth.users delete chain.
--    folio_accounts.user_id, folio_contacts.user_id, folio_meetings.user_id,
--    folio_items.user_id, folio_quick_tasks.user_id, folio_orgs.owner_id,
--    gauge_projects.user_id, gauge_templates.user_id,
--    folio_account_notes.user_id, folio_activity.user_id all default to
--    `restrict` (no cascade rule declared).
--
--    Why we leave it: a stray Supabase Auth delete would silently nuke a
--    user's entire portfolio + every org they own. The current `restrict`
--    behavior makes Auth delete loudly fail until a human migrates data.
--    A real GDPR "delete me" flow needs a dedicated server function that
--    transfers org ownership first, archives or hard-deletes the user's
--    accounts, then drops the auth row — not a blanket cascade.
--
--    Already cascading on auth.users delete (correct & narrow):
--      - folio_pip_usage.user_id          — append-only usage rows
--      - folio_pip_facts.user_id          — user-only memory
--      - folio_pip_account_state.user_id  — derived cache per user
--      - folio_audit_log.user_id          — per-user audit trail
--      - folio_org_members.user_id        — membership row
--      - folio_cadences.user_id           — per-user recurrence
--    These are derived / per-user; cascading them with the auth row is
--    safe and keeps the DB clean.
--
-- 2. folio_accounts → child cascade chain (delete-account scenario).
--    All correctly cascade today:
--      folio_contacts, folio_meetings, folio_items, folio_cadences,
--      folio_account_notes, folio_activity, folio_pip_account_state
--    Set-null today (intentional):
--      folio_quick_tasks.account_id  — tasks survive account delete
--    Set-null after this migration:
--      gauge_projects.account_id     — see CHANGE 1 above
--
-- 3. folio_meetings → child references.
--    gauge_projects.meeting_id → on delete set null ✓ (project survives
--    meeting delete, just loses the source-meeting link).
--    folio_meetings.cadence_id → on delete set null ✓ (cadence delete
--    leaves history intact).
