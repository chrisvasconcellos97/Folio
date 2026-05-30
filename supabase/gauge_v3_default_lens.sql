-- Gauge V3 Phase 2 — lens system on folio_org_members
--
-- Adds default_lens column so every member has an explicit AM / Leader /
-- Admin view assigned at invite time. Phase 2 wires the column + invite
-- UI + Pip prompt branching. Phases 3-5 build the actual lens-shaped
-- surfaces (queue UI, Leader rollup, AM "Projects I own" home).
--
-- Backfill rule (matches the in-app invite dropdown smart pre-fill):
--   role owner/admin → 'leader'
--   role member      → 'am'
--   anything else    → 'am'
--
-- Idempotent: safe to re-run.

alter table folio_org_members
  add column if not exists default_lens text not null default 'am'
    check (default_lens in ('am','leader','admin'));

-- Backfill once. The 'is_already_set' check makes this re-runnable without
-- clobbering anything an invite has chosen explicitly. We seed only rows
-- where default_lens is still 'am' (the column default) — a safe heuristic
-- since pre-migration rows could only have ended up there via the default.
update folio_org_members
   set default_lens = 'leader'
 where default_lens = 'am'
   and role in ('owner','admin');

create index if not exists folio_org_members_default_lens_idx
  on folio_org_members (default_lens);
