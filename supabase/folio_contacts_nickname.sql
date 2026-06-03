-- Add nickname column to folio_contacts
alter table folio_contacts
  add column if not exists nickname text;
