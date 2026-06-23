-- Security hardening — 2026-06-17 audit (§2 DB items)
-- Verified against live Supabase advisors + pg_policies before acting.

-- ✅ APPLIED TO PROD (migration security_hardening_search_path_20260617) +
--    folded into schema.sql function defs. Pins search_path on trigger fns
--    (advisor lint 0011). Zero behavior change.
alter function public.update_updated_at()            set search_path = '';
-- update_last_interaction() references folio_accounts UNQUALIFIED in its body,
-- so an empty search_path makes it throw "relation folio_accounts does not
-- exist" on every meeting/conversation insert (it's the trigger that bumps
-- folio_accounts.last_interaction_at). It MUST keep `public` in the path.
-- (Corrected 2026-06-23 after the '' pin broke meeting logging in prod. The
-- prod fix is: alter function public.update_last_interaction() set search_path = public;
-- Do NOT pin this one to '' — qualify the body as public.folio_accounts first
-- if you ever want to.)
alter function public.update_last_interaction()      set search_path = public;
alter function public.folio_tasks_touch_updated_at() set search_path = '';
alter function public.set_updated_at()               set search_path = '';

-- ❌ NOT APPLIED — REVOKE EXECUTE on the 6 SECURITY DEFINER helpers
--    (folio_member_role_unchanged, folio_org_peer_user_ids, folio_user_org_ids,
--     folio_user_writable_org_ids, gauge_owner_unchanged, rls_auto_enable).
--    pg_policies scan (2026-06-17) shows ALL SIX are referenced inside live RLS
--    policies (USING/WITH CHECK) on folio_accounts, folio_tasks, folio_org_members,
--    folio_orgs, folio_activity, gauge_projects for the `public` role. Postgres
--    requires the querying role to hold EXECUTE on functions evaluated during RLS,
--    so revoking would cause "permission denied for function" on the app's core
--    reads/writes — it would BREAK production. The flagged risk is also low: these
--    fns are caller-scoped (return the caller's OWN org/role) or boolean guards;
--    direct /rpc/ access leaks nothing.
--    PROPER FIX (deferred — a real migration, not a one-liner): recreate them in a
--    non-API-exposed schema (e.g. `private`) and repoint every policy reference,
--    which removes the PostgREST RPC surface without touching RLS. Do under test.

-- ⚙️  MANUAL — leaked-password protection (advisor auth_leaked_password_protection):
--    Dashboard → Auth → Settings → enable "Leaked password protection". Not scriptable here.
