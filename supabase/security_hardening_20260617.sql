-- Security hardening — 2026-06-17 audit (§2 DB items)
-- Confirmed against live Supabase advisors (security) before writing.
-- SAFE + backward-compatible: applies to both the current prod code and the
-- branch's audited code. Does NOT change app behavior.
--
-- NOT YET APPLIED TO PROD — awaiting Chris's explicit go. Apply via MCP
-- apply_migration (or Supabase SQL editor), then fold the relevant ALTERs
-- into the canonical schema.sql function definitions in the same commit.

-- 1) Pin search_path on trigger functions (lint 0011). These are RETURNS trigger,
--    no args. Empty search_path is the Supabase-recommended hardening.
alter function public.update_updated_at()            set search_path = '';
alter function public.update_last_interaction()      set search_path = '';
alter function public.folio_tasks_touch_updated_at() set search_path = '';
alter function public.set_updated_at()               set search_path = '';

-- 2) Revoke direct EXECUTE on internal SECURITY DEFINER helpers (lints 0028/0029).
--    These are referenced INSIDE RLS policies (USING / WITH CHECK) and as guards;
--    RLS policy evaluation does not depend on the caller holding EXECUTE, so
--    revoking the public RPC surface blocks direct /rpc/ abuse without breaking
--    policy enforcement. VERIFY on a Supabase branch before prod if unsure.
revoke execute on function public.folio_member_role_unchanged(uuid, text, uuid) from anon, authenticated;
revoke execute on function public.folio_org_peer_user_ids()                     from anon, authenticated;
revoke execute on function public.folio_user_org_ids()                          from anon, authenticated;
revoke execute on function public.folio_user_writable_org_ids()                 from anon, authenticated;
revoke execute on function public.gauge_owner_unchanged(uuid, uuid, uuid)       from anon, authenticated;
revoke execute on function public.rls_auto_enable()                             from anon, authenticated;

-- 3) Leaked-password protection (lint auth_leaked_password_protection):
--    NOT scriptable here — enable in Dashboard → Auth → Settings →
--    "Leaked password protection" (HaveIBeenPwned check).
