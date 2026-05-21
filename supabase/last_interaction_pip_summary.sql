-- Adds last interaction tracking and account-level Pip summary storage
-- Run once in Supabase SQL editor

alter table folio_accounts add column if not exists last_interaction_at  timestamptz;
alter table folio_accounts add column if not exists pip_account_summary  text;
alter table folio_accounts add column if not exists pip_account_summary_at timestamptz;
