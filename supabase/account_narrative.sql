-- Account Narrative Memory (the "knows my accounts cold" layer).
-- A re-derived, structured 4-part STORY of each account, rebuilt from evidence
-- whenever the account materially changes (fingerprint-gated, F3 pattern).
--
-- All additive + nullable → zero risk to the running app; all reads are
-- fail-soft (no narrative stored → the context section simply omits).
--
--   narrative jsonb            { arc, standing, hinges_on, trajectory, trajectory_why, as_of }
--   narrative_fingerprint text the computeContextFingerprint() the story was derived from
--   narrative_at timestamptz   when it was last re-derived

alter table folio_pip_account_state add column if not exists narrative jsonb;
alter table folio_pip_account_state add column if not exists narrative_fingerprint text;
alter table folio_pip_account_state add column if not exists narrative_at timestamptz;
