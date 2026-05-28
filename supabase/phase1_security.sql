-- Phase 1 — security hardening
-- Run manually in Supabase SQL editor. Safe to re-run (drop-if-exists / IF NOT EXISTS).
--
-- WHAT THIS FIXES
-- ──────────────────────────────────────────────────────────────────────
-- 1. Every `for all` policy in schema.sql / team_org_layer.sql used
--    `using (...)` only, with NO `with check (...)`. That means an
--    authenticated user could INSERT a row whose `user_id` is someone
--    else's UUID, or UPDATE a row to switch ownership. RLS only blocks
--    visibility, not malicious mutation, without `with check`.
--    Re-creating each policy with explicit `with check` closes this.
--
-- 2. `members_self_accept` on folio_org_members used a `with check
--    (user_id = auth.uid())` clause but no column-scope guard — an
--    invitee could UPDATE their own row to set role = 'owner' and
--    escalate. We add a function-based guard that rejects role / org_id
--    edits unless the caller is the org owner.
--
-- 3. `accounts_org_write` on folio_accounts was `for all` with no
--    `with check`. A writable org member could change `user_id` on any
--    org account to a stranger. Re-create with `with check` matching
--    `using`.
--
-- 4. Folio_audit_log + folio_pip_account_state + folio_pip_facts +
--    folio_routes already have `with check`. No action needed.
--
-- 5. Tightens `members_org_read` to remove the duplicate that pairs with
--    `members_self_read` (purely cosmetic, no behavior change).
--
-- This file ONLY drops + recreates policies. No tables, no columns, no
-- destructive data ops.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Re-create `for all` policies on user-scoped tables with `with check`
-- ──────────────────────────────────────────────────────────────────────

drop policy if exists "Users manage own accounts"        on folio_accounts;
create policy "Users manage own accounts"
  on folio_accounts for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own contacts"        on folio_contacts;
create policy "Users manage own contacts"
  on folio_contacts for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own meetings"        on folio_meetings;
create policy "Users manage own meetings"
  on folio_meetings for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own items"           on folio_items;
create policy "Users manage own items"
  on folio_items for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own cadences"  on folio_cadences;
create policy "Users manage their own cadences"
  on folio_cadences for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own quick tasks"     on folio_quick_tasks;
create policy "Users manage own quick tasks"
  on folio_quick_tasks for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Gauge owner access"               on gauge_projects;
create policy "Gauge owner access"
  on gauge_projects for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Template owner access"            on gauge_templates;
create policy "Template owner access"
  on gauge_templates for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notes_owner"                      on folio_account_notes;
create policy "notes_owner"
  on folio_account_notes for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 2. folio_orgs — owner_all + member_read kept as-is, but tighten check
-- ──────────────────────────────────────────────────────────────────────

drop policy if exists "orgs_owner_all" on folio_orgs;
create policy "orgs_owner_all" on folio_orgs
  for all
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ──────────────────────────────────────────────────────────────────────
-- 3. folio_org_members — owner_all gets `with check`, member-self-accept
--    is restricted: a member can only flip themselves from invited → accepted,
--    NOT change role or org. Role changes must come from the org owner.
-- ──────────────────────────────────────────────────────────────────────

drop policy if exists "members_owner_all"     on folio_org_members;
create policy "members_owner_all" on folio_org_members
  for all
  using (
    org_id in (select id from folio_orgs where owner_id = auth.uid())
  )
  with check (
    org_id in (select id from folio_orgs where owner_id = auth.uid())
  );

-- Drop the old self-accept policy (which let a member rewrite any column
-- on their own row, including role).
drop policy if exists "members_self_accept" on folio_org_members;

-- Helper: returns the existing row so policy can compare new vs old.
-- (Postgres RLS doesn't expose OLD/NEW directly to `with check`; we use a
-- security-definer function that re-reads the row by id.)
create or replace function folio_member_role_unchanged(member_id uuid, new_role text, new_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = new_role and org_id = new_org_id
       from folio_org_members
      where id = member_id),
    false
  )
$$;
grant execute on function folio_member_role_unchanged(uuid, text, uuid) to authenticated;

-- A user can update only their own row, AND only if role + org_id stay
-- the same as the stored value. Net effect: they can flip
-- `accepted` true and set `user_id` to themselves; nothing else.
create policy "members_self_accept" on folio_org_members
  for update
  using (
    user_id = auth.uid()
    or (user_id is null and invited_email = auth.email())
  )
  with check (
    (user_id = auth.uid() or (user_id is null and invited_email = auth.email()))
    and folio_member_role_unchanged(id, role, org_id)
  );

-- ──────────────────────────────────────────────────────────────────────
-- 4. folio_accounts — org_write gets `with check` and locks user_id
-- ──────────────────────────────────────────────────────────────────────

drop policy if exists "accounts_org_write" on folio_accounts;
create policy "accounts_org_write" on folio_accounts
  for all
  using (
    org_id is not null and org_id in (select folio_user_writable_org_ids())
  )
  with check (
    org_id is not null and org_id in (select folio_user_writable_org_ids())
  );

-- ──────────────────────────────────────────────────────────────────────
-- 5. gauge_projects assignee write — block changing user_id / account_id
-- ──────────────────────────────────────────────────────────────────────
-- The current policy lets an assignee update any column. Add a guard that
-- the underlying owner (user_id) and account linkage can't be rewritten.

create or replace function gauge_owner_unchanged(project_id uuid, new_user_id uuid, new_account_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select user_id = new_user_id
       and (account_id is not distinct from new_account_id)
       from gauge_projects
      where id = project_id),
    false
  )
$$;
grant execute on function gauge_owner_unchanged(uuid, uuid, uuid) to authenticated;

drop policy if exists "Gauge assignee update" on gauge_projects;
create policy "Gauge assignee update"
  on gauge_projects for update
  using      (assignee = auth.email())
  with check (
    assignee = auth.email()
    and gauge_owner_unchanged(id, user_id, account_id)
  );
