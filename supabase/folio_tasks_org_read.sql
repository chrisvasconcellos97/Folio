-- Org-scoped read access for folio_tasks.
--
-- folio_tasks previously had only owner-scoped policies (auth.uid() = user_id),
-- so the Leadership rollup and the Teammate drill-in could never see a
-- teammate's tasks — the open-item counts read ~0 and TeammateDetailView's
-- "Open tasks" section was always empty.
--
-- This adds an ADDITIVE select policy: a user may read tasks owned by anyone
-- who shares an accepted org membership with them. It mirrors the existing
-- gauge_projects cross-user visibility (assignee select) and uses a
-- SECURITY DEFINER helper to avoid RLS recursion on folio_org_members
-- (same pattern as folio_user_org_ids() in schema.sql).
--
-- Run this in Supabase and verify in the SQL editor that a leader can read a
-- teammate's folio_tasks and that a user with NO shared org still cannot.

create or replace function folio_org_peer_user_ids()
returns setof uuid
language sql security definer stable set search_path = public
as $$
  -- Every user_id that shares an accepted org membership with the caller.
  select distinct them.user_id
  from folio_org_members me
  join folio_org_members them on them.org_id = me.org_id
  where me.user_id = auth.uid()
    and me.accepted = true
    and them.accepted = true
    and them.user_id is not null
$$;
grant execute on function folio_org_peer_user_ids() to authenticated;

drop policy if exists "tasks_org_peer_read" on folio_tasks;
create policy "tasks_org_peer_read" on folio_tasks
  for select
  using (user_id in (select folio_org_peer_user_ids()));
