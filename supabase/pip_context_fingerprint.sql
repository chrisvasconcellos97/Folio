-- F2/F3 — event-driven Pip-state recompute.
-- Adds the structured-context persistence + content-fingerprint gate columns to
-- folio_pip_account_state. See docs/pip-architecture-f3-plan.md.
--
-- context_struct      — the buildAccountContext() structured output (jsonb).
--                       Durable record of "what Pip knew" + substrate for F6.
-- context_fingerprint — a time-stable hash of the account's signal inputs
--                       (computeContextFingerprint in src/lib/accountContext.js).
--                       The recompute gate skips the Haiku call when this is
--                       unchanged since the last compute.
-- context_checked_at  — last time the server evaluated this account for
--                       recompute (set even when the Haiku call is skipped).
--
-- Additive + idempotent — safe to re-run.

alter table folio_pip_account_state
  add column if not exists context_struct      jsonb,
  add column if not exists context_fingerprint text,
  add column if not exists context_checked_at  timestamptz;
