# Account Narrative Memory — build plan (the "knows my accounts cold" layer)

*Status: Stage 1 building on `claude/folios-full-audit-er5j62`, held local. Decisions locked by Chris (June 26 2026).*

## What it is
A persisted, **re-derived** structured read of each account — the *story*, not a list of
rows — that Pip rebuilds from evidence whenever the account materially changes, and that
surfaces on the high-frequency surfaces so Pip "knows the account cold." Four parts:

- **arc** — how it got here (1–2 sentences)
- **standing** — where it stands now (1–2 sentences)
- **hinges_on** — the 1–2 things the relationship turns on
- **trajectory** — `warming | cooling | steady` + a short `trajectory_why`
- **as_of** — the date of the newest evidence (staleness honesty)

## Decisions locked (Chris, June 26 2026)
- **Surfaces:** pre-call cadence brief + account-page header + daily brief (chat rides free via the shared builder).
- **Shape:** structured 4-part (above).
- **Timing:** build the engine now; it sharpens as digest notes accrue.

## THE LANDMINE — re-derived, NEVER accumulating
Two ways to build this; one is a trap.
- **Accumulating** (append to a running story): a single wrong conclusion ("supplier is
  resource-constrained") becomes a permanent lens that colours everything after — bias-lock,
  the exact failure rejected for personality traits, one level up. **Forbidden.**
- **Re-derived** (on each material change, discard the old narrative and rebuild from the
  evidence floor): the story is always a *current read of the facts*, self-correcting. **This
  is the only safe design.** The snapshots/meetings/updates stay as the evidence floor so a
  wrong narrative is always rebuildable, never trusted on faith.

## Architecture
1. **Store** — three columns on `folio_pip_account_state` (no parallel table — App Coherence):
   `narrative jsonb`, `narrative_fingerprint text`, `narrative_at timestamptz`.
2. **Trigger / gate** — reuse the F3 fingerprint (`computeContextFingerprint(bundle)`). Re-derive
   an account's narrative ONLY when its fingerprint differs from the stored
   `narrative_fingerprint` → event-driven, $0 on quiet accounts. Same drift-lock discipline
   (stable inputs only — ids/dates/counts, never relative-time).
3. **Synthesis (Stage 2)** — one Sonnet call on change → the 4-part object. Reads the evidence
   floor `buildAccountContext` already assembles (meetings, digest notes, promise log, health
   trend, waiting-ons, relationships). DATA LINE hard here (it reads a lot of account text):
   generalize all numbers. Metered + spend-capped.
4. **Surface (Stage 3)** — render via `buildAccountContext` so it reaches chat + Brief Me +
   cadence brief by construction (parity). Account-page header + daily brief read the structured
   object directly.
5. **Honesty** — carries `as_of`; stays staleness-humble; re-derived so it self-corrects.

## Strategic kicker — absorbs the cost cleanup (audit #20)
The narrative becomes the rich per-account read, re-derived on change. That lets us retire the
constantly-firing thin `pip-state-refresh` `state_prose` (1,031 calls, no cache, 70% of accounts)
into this one event-gated layer. The hardest build and the biggest cost win become one move.
(Deferred to Stage 4 — do not couple it to Stage 1–3 shipping.)

## Staged build (one concern per gated commit; gates = vitest · check-guards · vite build)
- **Stage 1 (this commit):** pure `src/lib/accountNarrative.js` (validate + render) + tests;
  wire the render section into `accountContext.js` (`includeNarrative` preset flag + SECTION_ORDER);
  migration `supabase/account_narrative.sql` + fold into `schema.sql`. Fail-soft: with no
  narrative stored, the section renders nothing — zero behaviour change until Stage 2 writes data.
- **Stage 2:** `api/account-narrative.js` (Sonnet synthesis, JWT, logPipUsage, spend-cap, data-line,
  fingerprint-gated, salvage) + `useAccountNarrative` trigger (event-gated, fail-soft on missing
  columns) mounted above App's authLoading return. Register in `test-api-imports.js`.
- **Stage 3:** surface — account-page header card (reads structured object) + pass narrative into
  the daily brief payload (portfolio-brief) + confirm it renders in the cadence brief.
- **Stage 4 (separate):** retire/fold `pip-state-refresh` into the narrative (audit #20).

## Data line
Synthesis reads a lot of account text → highest retention pressure in the app. The prompt MUST
generalize every quantitative figure (revenue, volumes, shop/customer counts, pricing, contract
terms) to qualitative — "volume healthy", never the number. Documented in `data-handling.md` +
`ai-governance.md` on Stage 2 ship.

## Migration (apply on ship; reads fail-soft until then)
```sql
alter table folio_pip_account_state add column if not exists narrative jsonb;
alter table folio_pip_account_state add column if not exists narrative_fingerprint text;
alter table folio_pip_account_state add column if not exists narrative_at timestamptz;
```
