-- Contact aliases (org-scoped so the whole team shares them)
create table if not exists folio_contact_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references folio_orgs(id) on delete cascade,
  contact_id uuid references folio_contacts(id) on delete cascade,
  alias text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(org_id, alias)
);

alter table folio_contact_aliases enable row level security;

create policy "org members can read aliases"
  on folio_contact_aliases for select
  using (
    org_id in (select org_id from folio_org_members where user_id = auth.uid())
    or org_id is null
  );

create policy "org members can insert aliases"
  on folio_contact_aliases for insert
  with check (
    org_id in (select org_id from folio_org_members where user_id = auth.uid())
    or org_id is null
  );

create policy "alias creator can delete"
  on folio_contact_aliases for delete
  using (created_by = auth.uid());

-- Index for fast alias lookup
create index if not exists folio_contact_aliases_org_alias
  on folio_contact_aliases(org_id, lower(alias));
