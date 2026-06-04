-- Global task cadences.
--
-- A task cadence with account_id = null and is_global = true applies to EVERY
-- account. This column has existed in production but was never captured in a
-- committed migration — this backfills that gap so a fresh project / DR restore
-- reproduces it. Mirrored into supabase/schema.sql.

alter table folio_cadences
  add column if not exists is_global boolean not null default false;

create index if not exists folio_cadences_is_global_idx
  on folio_cadences(user_id) where is_global = true;
