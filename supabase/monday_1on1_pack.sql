-- Monday 1:1 pack cache (June 19 2026) — Phase 2 #1 "SHINE".
--
-- Chris runs his Monday 1:1 from Folios; the pack auto-assembles a prep sheet
-- (promised-vs-done, boss's open asks pre-answered, what moved, who has the ball)
-- so he's never flat-footed. Most of it is deterministic assembly; only the Pip
-- read + the boss-ask extraction need a model call.
--
-- These columns cache that ONE Sonnet output on the cadence row. Regeneration is
-- event-driven (the F3 principle): the client recomputes a content fingerprint of
-- the week's inputs and only re-calls the model when pack_fingerprint changes, or
-- the week rolls over (pack_week). A quiet week never re-bills. Deterministic
-- sections are NOT cached (computed client-side, always fresh).
--
-- Precedent: folio_cadences already carries pip_brief / pip_brief_at for the
-- per-cadence brief. Additive + harmless to apply before the code ships.

alter table folio_cadences
  add column if not exists pack jsonb,             -- { read, boss_asks: [{ask, status, account}] }
  add column if not exists pack_fingerprint text,  -- F3-style stable hash of the week's inputs
  add column if not exists pack_generated_at timestamptz,
  add column if not exists pack_week date;         -- the Monday this pack is for (week rollover gate)
