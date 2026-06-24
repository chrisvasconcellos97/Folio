-- ──────────────────────────────────────────────────────────────────────
-- Audit 2026-06-24 — Batch 1 prod migration (run in the Supabase SQL Editor).
--
-- Idempotent + additive. Safe to run multiple times. Covers the only Batch-1
-- changes that affect the LIVE database:
--   1. folio_merge_accounts → re-parent folio_wins + folio_embeddings on merge
--      (without this, merging an account silently dark-spots its semantic recall
--       and detaches its logged wins — same lose-on-merge class already fixed
--       for tasks/updates/snapshots).
--   2. Defensive add-if-not-exists for columns that schema.sql now declares but
--      that were applied piecemeal in prod (task_notes, follow_up_on_return).
--
-- The forward-reference fix and the away_periods fold are schema.sql-canonical
-- (rebuild fidelity) and need no prod action — prod already has those objects.
-- After running, re-run supabase/verify_migrations.sql to confirm green.
-- ──────────────────────────────────────────────────────────────────────

-- 1. Merge re-parenting (the data-integrity fix) ------------------------------
create or replace function folio_merge_accounts(source_id uuid, target_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_row folio_accounts%rowtype;
  target_row folio_accounts%rowtype;
  moved      integer := 0;
  bumped     integer;
begin
  if source_id is null or target_id is null then
    raise exception 'source and target are required';
  end if;
  if source_id = target_id then
    raise exception 'cannot merge an account into itself';
  end if;

  select * into source_row from folio_accounts where id = source_id;
  if not found then raise exception 'source account not found or not visible'; end if;
  select * into target_row from folio_accounts where id = target_id;
  if not found then raise exception 'target account not found or not visible'; end if;

  if (source_row.account_type in ('internal_team','partner')
      or target_row.account_type in ('internal_team','partner'))
     and coalesce(source_row.account_type, 'standard') <> coalesce(target_row.account_type, 'standard') then
    raise exception 'cannot merge across workspace types';
  end if;

  update folio_meetings      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_items         set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_tasks         set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_contacts      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_cadences      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_account_notes set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_account_updates set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_activity      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  delete from folio_pip_account_state where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_quick_tasks   set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update gauge_projects      set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update gauge_projects
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;

  update pip_correction_log       set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_account_snapshots  set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update pip_assignment_hints     set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update pip_promise_log          set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_pip_questions
     set suggestion = jsonb_set(
           jsonb_set(suggestion, '{account_id}',   to_jsonb(target_id::text)),
           '{account_name}', to_jsonb(coalesce(target_row.name, '')))
   where suggestion is not null
     and suggestion->>'account_id' = source_id::text;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_meetings
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_cadences
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- NEW (2026-06-24): re-parent tables added after the previous merge update.
  update folio_wins        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_embeddings  set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_accounts
     set is_inactive            = true,
         inactivated_at         = now(),
         merged_into_account_id = target_id,
         updated_at             = now()
   where id = source_id;

  return moved;
end;
$$;

grant execute on function folio_merge_accounts(uuid, uuid) to authenticated;

-- 2. Defensive column reconciliation (no-ops if already present) ---------------
alter table folio_tasks    add column if not exists task_notes          jsonb not null default '[]'::jsonb;
alter table folio_tasks    add column if not exists follow_up_on_return boolean default false;
alter table folio_meetings add column if not exists follow_up_on_return boolean default false;
