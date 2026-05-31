-- Pip 1:1 mode — person-scoped cadences.
-- Makes account_id nullable on folio_cadences so a cadence can be
-- tied to a contact (boss, mentor, etc.) rather than an account.

alter table folio_cadences
  alter column account_id drop not null;

alter table folio_cadences
  add column if not exists contact_id uuid
    references folio_contacts(id) on delete set null;

alter table folio_cadences
  add column if not exists cadence_scope text not null default 'account';
  -- 'account' | 'person'

create index if not exists folio_cadences_contact_id
  on folio_cadences (contact_id)
  where contact_id is not null;

create index if not exists folio_cadences_scope
  on folio_cadences (user_id, cadence_scope);
