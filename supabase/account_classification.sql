-- Account classification: supplier tags, serviced states, auto-region
-- Run once in Supabase SQL editor

alter table folio_accounts add column if not exists tags            text[]  default '{}';
alter table folio_accounts add column if not exists serviced_states text[]  default '{}';
alter table folio_accounts add column if not exists region          text;
alter table folio_accounts add column if not exists market_scope    text;
