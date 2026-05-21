-- Add extended contact fields
alter table folio_contacts add column if not exists phone    text;
alter table folio_contacts add column if not exists email    text;
alter table folio_contacts add column if not exists linkedin text;
