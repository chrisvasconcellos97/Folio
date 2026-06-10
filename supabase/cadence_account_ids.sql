-- Multi-department cadences (Game Plan 1.8, June 10 2026)
-- One internal cadence can span several departments; account_id stays the
-- primary, account_ids carries the full set. Also fixes the latent
-- multi-account TASK cadence bug (SetCadenceModal wrote account_ids since
-- Gauge V3 but the column never existed, so those inserts failed).
-- Applied to production via MCP migration `cadence_account_ids`.

alter table folio_cadences add column if not exists account_ids uuid[] default '{}';
