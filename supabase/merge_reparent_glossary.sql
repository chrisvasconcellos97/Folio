-- Audit 2026-06-25 — merge re-parent gap: pip_glossary
--
-- folio_merge_accounts only SOFT-deletes the source account (is_inactive=true),
-- so child rows are NOT cascade-purged — each child table must be explicitly
-- re-parented to the target. pip_glossary (account-scoped terminology) was the
-- one table missing from the re-parent set: after a merge the absorbed account's
-- glossary terms stayed pointed at the dead source and never surfaced for the
-- target (useGlossary filters by account_id), so Pip lost that account's words.
--
-- This re-creates folio_merge_accounts WITH the pip_glossary re-parent added
-- (the only change vs the live function). Idempotent — run once in the prod SQL
-- editor. Kept byte-identical to schema.sql's canonical definition.
--
-- To recover ALREADY-merged pairs (pre-fix), run for each:
--   update pip_glossary set account_id = '<target>' where account_id = '<source>';

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

  update folio_wins        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_embeddings  set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  -- NEW: account-scoped glossary terms (the absorbed account's vocabulary).
  update pip_glossary      set account_id = target_id where account_id = source_id;
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
