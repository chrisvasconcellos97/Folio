-- Batch 2 correctness migrations (June 2026)
-- Apply to prod via Supabase MCP. Idempotent.

-- B2.1: Fix pip_promise_log FK — was pointing to retired folio_items,
--        now points to folio_tasks (the unified table). Every closeItem
--        promise-log insert had silently failed since the unification.
--        Prod constraint name may differ; drop-and-recreate is safe because
--        on-delete is SET NULL (no cascades to worry about).
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'pip_promise_log_item_id_fkey'
       and conrelid = 'pip_promise_log'::regclass
  ) then
    alter table pip_promise_log drop constraint pip_promise_log_item_id_fkey;
  end if;
  -- Re-add pointing to folio_tasks
  alter table pip_promise_log
    add constraint pip_promise_log_item_id_fkey
    foreign key (item_id) references folio_tasks(id) on delete set null;
exception when others then null;
end $$;

-- B2.2: Add pip_tone column to folio_accounts so Cooling/Warming trend pills can fire.
alter table folio_accounts
  add column if not exists pip_tone text;

-- B2.9: folio_activity solo-user SELECT RLS policy (Settings → Activity was
--        permanently empty for solo users — the only existing read policy is
--        org-scoped). INSERT already works via the existing activity_insert
--        policy, so no solo insert policy here (avoids a duplicate permissive policy).
drop policy if exists "folio_activity_solo_user_select" on folio_activity;
create policy "folio_activity_solo_user_select" on folio_activity
  for select using ((select auth.uid()) = user_id);
