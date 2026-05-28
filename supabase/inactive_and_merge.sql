-- ──────────────────────────────────────────────────────────────────────
-- Inactive / Archive + Account Merge
-- ──────────────────────────────────────────────────────────────────────
-- Soft-archive replaces hard delete for accounts and org members.
-- Inactive accounts stay editable + listable (greyed in UI). Inactive
-- members are blocked from sign-in. Merge re-parents every child row
-- from a source account to a target account via a single Postgres
-- function so it's atomic; the source is then marked inactive with a
-- pointer back to the survivor.
--
-- Safe to re-run — every statement is `if not exists` or guarded.
--
-- MANUAL TEST PLAN
-- ───────────────────────────────────────────────────────────────────
-- 1. Create two accounts A and B owned by the same auth.uid().
-- 2. Add a meeting, item, contact, cadence, account_note, activity row,
--    pip_account_state row, and gauge project under A.
-- 3. Call select folio_merge_accounts('<A.id>'::uuid, '<B.id>'::uuid);
-- 4. Verify:
--    - All child rows now point to B (account_id = B.id).
--    - gauge_projects.account_ids that contained A now contain B.
--    - A.is_inactive = true, A.inactivated_at not null,
--      A.merged_into_account_id = B.id.
--    - B is untouched.
-- 5. Try the same as a different user — should fail with permission error.
-- 6. Try merging A into A — should raise an exception.
-- ──────────────────────────────────────────────────────────────────────

-- Accounts: soft-inactive flag + merge pointer
alter table folio_accounts
  add column if not exists is_inactive boolean default false;
alter table folio_accounts
  add column if not exists inactivated_at timestamptz;
alter table folio_accounts
  add column if not exists merged_into_account_id uuid references folio_accounts(id) on delete set null;

create index if not exists folio_accounts_is_inactive_idx
  on folio_accounts(is_inactive);

-- Org members: soft-inactive flag (blocks sign-in)
alter table folio_org_members
  add column if not exists is_inactive boolean default false;
alter table folio_org_members
  add column if not exists inactivated_at timestamptz;

create index if not exists folio_org_members_is_inactive_idx
  on folio_org_members(is_inactive);

-- ──────────────────────────────────────────────────────────────────────
-- Merge function — atomically re-parents every child row from source
-- to target and marks the source inactive. Runs with `security invoker`
-- so RLS still enforces ownership on every UPDATE — a user can only
-- merge accounts they own.
-- ──────────────────────────────────────────────────────────────────────
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
  if not found then
    raise exception 'source account not found or not visible';
  end if;

  select * into target_row from folio_accounts where id = target_id;
  if not found then
    raise exception 'target account not found or not visible';
  end if;

  -- Same workspace type — merging a Partner into a Department would
  -- corrupt the type-conditional UI.
  if coalesce(source_row.account_type, 'standard') <> coalesce(target_row.account_type, 'standard') then
    -- Allow merging between customer subtypes (standard / mso / shop)
    -- since the workspace UI treats them all as customers, but block
    -- cross-workspace merges (customer ↔ internal_team ↔ partner).
    if (source_row.account_type in ('internal_team','partner')
        or target_row.account_type in ('internal_team','partner'))
       and source_row.account_type <> target_row.account_type then
      raise exception 'cannot merge across workspace types';
    end if;
  end if;

  -- Child re-parents. Each UPDATE flows through RLS as the calling user.
  update folio_meetings        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_items           set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_contacts        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_cadences        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_account_notes   set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  update folio_activity        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- pip_account_state has account_id as PRIMARY KEY — can't move a row
  -- whose new id would collide with an existing row. Delete the source
  -- entry so the target's cache stays canonical; Pip will rebuild on
  -- the next read.
  delete from folio_pip_account_state where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- Quick tasks (cascade is set null, but we want them to follow the
  -- merge so a task on the absorbed account doesn't lose context).
  update folio_quick_tasks     set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- Gauge projects — primary account_id
  update gauge_projects        set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- Gauge projects — multi-account array column. array_replace leaves
  -- any non-matching elements alone; if the array didn't contain
  -- source_id the row is unaffected.
  update gauge_projects
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- Mark the source inactive and point it at the survivor.
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
