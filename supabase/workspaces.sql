-- Workspaces — Departments + Partners
--
-- Reuses folio_accounts via the existing free-text `account_type` column
-- (extended to 'internal_team' and 'partner' alongside standard/mso/shop).
-- No new constraints — `account_type` stays free text so it can grow further.
--
-- All columns are nullable and additive. Safe to run multiple times.
-- Run manually in production Supabase.

alter table folio_accounts add column if not exists agreement_end_date date;
alter table folio_accounts add column if not exists scope_summary       text;
alter table folio_accounts add column if not exists billing_terms       text;
alter table folio_accounts add column if not exists spend_ytd           numeric;

alter table folio_contacts add column if not exists is_leader  boolean default false;
alter table folio_contacts add column if not exists is_primary boolean default false;
