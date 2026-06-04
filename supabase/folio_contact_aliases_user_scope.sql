-- Make contact aliases work for solo users (no org) and fix the delete policy.
--
-- entity_detection.sql created folio_contact_aliases org-scoped only, with a
-- delete policy keyed on created_by — but the app never set created_by, so
-- removeAlias was RLS-blocked, and solo users (org_id null) had no per-user
-- scoping (the "org_id is null" read policy would have shared one global pool).
--
-- This adds a user_id column and replaces the policies so:
--   - org members share the org's aliases
--   - solo users get their own (org_id null + user_id = auth.uid())
--   - delete is allowed for the creator, the owning solo user, or an org member.
-- Mirrored into supabase/schema.sql.

alter table folio_contact_aliases add column if not exists user_id uuid references auth.users(id);

drop policy if exists "org members can read aliases"   on folio_contact_aliases;
drop policy if exists "org members can insert aliases"  on folio_contact_aliases;
drop policy if exists "alias creator can delete"        on folio_contact_aliases;
drop policy if exists "aliases_read"   on folio_contact_aliases;
drop policy if exists "aliases_insert" on folio_contact_aliases;
drop policy if exists "aliases_delete" on folio_contact_aliases;

create policy "aliases_read" on folio_contact_aliases for select using (
  (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
  or (org_id is null and user_id = auth.uid())
);
create policy "aliases_insert" on folio_contact_aliases for insert with check (
  (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
  or (org_id is null and user_id = auth.uid())
);
create policy "aliases_delete" on folio_contact_aliases for delete using (
  created_by = auth.uid()
  or (org_id is null and user_id = auth.uid())
  or (org_id is not null and org_id in (select org_id from folio_org_members where user_id = auth.uid() and accepted = true))
);

create index if not exists folio_contact_aliases_user_idx on folio_contact_aliases(user_id) where user_id is not null;
