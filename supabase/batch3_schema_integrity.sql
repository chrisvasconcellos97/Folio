-- Batch 3 schema + merge integrity migrations (June 2026)
-- Apply to prod via Supabase MCP. Idempotent.

-- B3.1: Fix pip_promise_log FK (same as batch2_correctness.sql — included here
--        for reference; running both is fine since the do/exception block is safe).

-- B3.2: folio_merge_accounts — re-parent 4 additional pip tables and fix
--        array columns on folio_meetings and folio_cadences.
--        Replace the whole function so the new re-parents are included.
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

  -- Re-parent pip tables introduced after the original merge function
  update pip_correction_log       set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_account_snapshots  set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update pip_assignment_hints     set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;
  update pip_promise_log          set account_id = target_id where account_id = source_id;
  get diagnostics bumped = row_count; moved := moved + bumped;

  -- Fix multi-account array columns on meetings and cadences
  update folio_meetings
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
  get diagnostics bumped = row_count; moved := moved + bumped;
  update folio_cadences
     set account_ids = array_replace(account_ids, source_id, target_id)
   where source_id = any (account_ids);
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

-- B3.3: Custom workspaces table (folded from supabase/custom_workspaces.sql).
create table if not exists folio_custom_workspaces (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid references folio_orgs(id) on delete set null,
  name       text not null,
  include_in_portfolio boolean not null default false,
  created_at timestamptz not null default now()
);

alter table folio_custom_workspaces enable row level security;

drop policy if exists "users manage own custom workspaces" on folio_custom_workspaces;
create policy "users manage own custom workspaces"
  on folio_custom_workspaces for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table folio_accounts
  add column if not exists custom_workspace_id uuid references folio_custom_workspaces(id) on delete set null;

-- B3.5: CHECK constraint — person-scope cadence requires contact_id.
do $$
begin
  alter table folio_cadences
    add constraint chk_person_cadence_requires_contact
    check (cadence_scope = 'account' or contact_id is not null);
exception when duplicate_object then null;
end $$;

-- B3.5: CHECK constraint — folio_tasks must have at least one anchor.
do $$
begin
  alter table folio_tasks
    add constraint chk_task_has_anchor
    check (account_id is not null or cadence_id is not null or project_id is not null);
exception when duplicate_object then null;
end $$;

-- B3.5: Unique partial index — no duplicate queued pip questions per user.
create unique index if not exists pip_questions_unique_queued
  on folio_pip_questions (user_id, question_text)
  where status = 'queued';

-- B3.6: life_items RLS — initplan wrap (replace raw auth.uid() call).
drop policy if exists "life_items_owner_all" on life_items;
create policy "life_items_owner_all" on life_items
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- B3.8: Gauge append-status-update RPC — server-side prepend avoids full-object
--        overwrites from concurrent clients.
create or replace function gauge_append_status_update(
  p_project_id uuid,
  p_body       text,
  p_by         text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_entry jsonb;
begin
  new_entry := jsonb_build_object(
    'body', p_body,
    'at',   to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'by',   p_by
  );
  update gauge_projects
     set status_updates = new_entry || coalesce(status_updates, '[]'::jsonb)
   where id = p_project_id
     and user_id = (select auth.uid());
end;
$$;

grant execute on function gauge_append_status_update(uuid, text, text) to authenticated;
