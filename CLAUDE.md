# Folios — Claude Development Context

## Deployment Rule
**Vercel production branch is `main`.** Every commit gets one push:
```
git push origin HEAD:main
```
**Do NOT push to any other branches** — every branch push triggers a Vercel deployment. Worktree agent branches are ephemeral and never pushed to remote directly; their commits are cherry-picked into `main`.

## API Module Import Rule (prevent FUNCTION_INVOCATION_FAILED)

With `"type":"module"` in `package.json`, Node.js ESM requires **explicit `.js` extensions** on all relative imports. Vercel's bundler (nft) follows the same resolution rules — a missing `.js` means the file is excluded from the serverless bundle, and the function crashes at load time with `FUNCTION_INVOCATION_FAILED` before any handler code runs.

**Rule:** Any file in `src/lib/` that is imported (directly or transitively) by an `api/*.js` handler must use explicit `.js` extensions on all its own relative imports.

**Verification:** Run `node scripts/test-api-imports.js` before pushing API changes. CI runs this automatically on every push. If a handler fails to load, you'll see exactly which file and why — before it hits Vercel.

**When adding a new `api/*.js` handler:** add it to the `handlers` array in `scripts/test-api-imports.js`.

The symptom of regression: Vercel logs `FUNCTION_INVOCATION_FAILED`; the function never starts; no error detail is available from the handler's own catch block because the module never loaded.

## Deploy Safety Rule (never make Chris clear cache)

The PWA service worker has bitten Chris twice — every deploy must update cleanly without requiring manual cache clears. Permanent guarantees in the codebase:

1. **SW config in `vite.config.js`** — `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`. Never remove these.
2. **Explicit registration in `src/main.jsx`** — two redundant update paths because the SW path keeps getting stuck:
   - **Path 1 — `controllerchange` listener.** Canonical signal that a new SW took over. `onNeedRefresh` does NOT fire when `skipWaiting + clientsClaim` are set (no waiting state). First controllerchange on a fresh visit is skipped so first-timers aren't bounced. Belt.
   - **Path 2 — version polling.** Fetches `/` with `cache: "no-store"` on startup, every 3 min, and on visibility change. Extracts the hashed `index-XXXX.js` filename and compares against the one in the page's loaded `<script src>`. If they differ, a new build is live → reload. **Completely independent of the service worker** so it catches updates even when the SW is misbehaving (e.g. user's installed SW predates the controllerchange listener and can't auto-update itself). Suspenders.
   - Both paths converge on a single `triggerReload()` guarded by a `reloading` flag so we never double-fire.
   - Folios autosaves notes / drafts / items, so silent reload is safe. Toast is a brief "Updating Folios…" hint.
   - Never remove either path; never re-add a manual refresh button without explicit reason.
3. **Vercel headers in `vercel.json`** — `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` all served with `Cache-Control: public, max-age=0, must-revalidate`. Hashed assets stay long-cached.
4. **Never gate critical features on cache state.** If the new build needs a fresh shell, the user gets the toast prompt — they never get a broken-looking app.
5. **Before any deploy that changes the SW or the shell — verify `vite.config.js` workbox block + main.jsx `registerSW` block are intact.** If a Patch build touches these files, double-check before merging.

Symptoms of SW staleness: app won't load, blank page, old UI showing despite recent deploy. Fix-in-the-moment: DevTools → Application → Service Workers → Unregister, then hard reload. But the system should prevent this from being needed.

## Vercel Serverless Function Rule (Pip API endpoints)

**`new Anthropic(...)` must never appear at module level or outside a try-catch in any Vercel handler.** If the SDK throws during construction (missing/invalid `ANTHROPIC_API_KEY`, network issue, etc.) and it happens outside a try-catch, the exception is uncaught — Vercel returns its own `FUNCTION_INVOCATION_FAILED` crash page instead of the function's JSON error response, and the function's catch block is never reached.

Pattern to follow in every `api/*.js` Pip endpoint:

```js
export default async function handler(req, res) {
  // 1. Early key check — returns clean JSON before touching the SDK
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }
  try {
    // 2. Client constructed INSIDE try-catch as its first statement
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // ... rest of handler
  } catch (err) {
    // catches SDK construction errors AND API call errors
    return res.status(500).json({ error: "Pip is unavailable right now.", detail: err.message });
  }
}
```

**Never** do `var client = new Anthropic(...)` at the top of the file (module level) or between the function signature and the first `try {`. The fix was applied to all six endpoints in commit `62b02a0` — do not regress it when adding new endpoints or modifying existing ones.

Symptoms of regression: Vercel logs show `FUNCTION_INVOCATION_FAILED`; `folio_errors` table stores that string verbatim; the client sees an opaque 500 with no JSON body.

## Sanity-Pass Rule (read before claiming a fix is shipped)

Chris has burned cycles on "fixes" that compiled clean but didn't actually fire at runtime — e.g. relying on `onNeedRefresh` when `skipWaiting + clientsClaim` make it never fire. Before declaring any fix done, do a 60-second sanity pass:

1. **Trace the actual runtime sequence, not the apparent one.** For event-driven code, ask: *what literally triggers this callback, and does my config produce that trigger?* Don't assume from a function name.
2. **For library/framework APIs, check the docs or source for trigger conditions** — especially when flags interact (e.g. `autoUpdate` mode + `skipWaiting` + `onNeedRefresh`).
3. **For "this should never happen again" fixes, mentally walk through the failure case** and confirm the new code path catches it. If you can't articulate the trigger sequence in one sentence, you don't understand the fix yet.
4. **For PWA / SW / auth / RLS / cache layers especially** — these are silent-failure surfaces. A build passing ≠ a fix working. The only validation is reasoning about the runtime sequence.
5. **If a previous fix on the same problem already shipped and didn't work, the bar is higher.** Don't try the same shape of solution twice. Re-derive from first principles.

This rule applies to me (Claude) AND to Patch when spawned for batch builds.

## Theme Rule

Folios supports two themes — **dark** (default) and **light**. Any new
UI work MUST support both:

1. **Use the `C` token from `src/lib/colors.js`** — never hardcode hex or
   rgba values for colors that have a token. If a token doesn't exist for
   your need, add it to both palettes in `index.html`'s CSS-vars block
   AND to `colors.js`.
2. **Light-only or dark-only effects** (animations, shadows, halos) must
   be scoped via `[data-theme="light"]` or `[data-theme="dark"]` so the
   other theme renders correctly.
3. **Before claiming a feature done, manually toggle the theme** and
   confirm both palettes render correctly. The toggle lives in Settings →
   Appearance.
4. **The dark theme is canonical for layout decisions; the light theme
   is the spec'd translation.** Light-mode-specific behaviors (hover
   lifts, mark pulse) are part of the light spec — don't backport to
   dark without an explicit instruction.

Mechanics: the palette swap happens via CSS custom properties on
`<html data-theme="…">`. The values live in `index.html`; `src/lib/colors.js`
exports a `C` object whose every property is a `var(--…)` reference, so all
inline `style={{ background: C.surface }}` consumers re-theme instantly with
no remount. Pre-mount theme application is done by an inline `<script>` in
`index.html` (no flash-of-wrong-theme). `useTheme()` reads/writes the
choice, persisting to `localStorage.folio_theme`.

### Light Theme — Open Polish Items

All shipped — see "Folios design system refresh" in Already shipped.

## Font Rule
**Never use Google Fonts CDN.** All fonts must be self-hosted via `@fontsource-variable` packages installed through npm and imported in `src/main.jsx`. Google Fonts calls get blocked by corporate network proxies. Current fonts: `@fontsource-variable/inter`, `@fontsource-variable/fraunces`, `@fontsource-variable/jetbrains-mono`.

## Mobile Input Rule (never make Chris fight Safari auto-zoom)
**On mobile / touch devices, every `<input>`, `<textarea>`, and `<select>` must render at >= 16px.** Below 16px, iOS Safari auto-zooms the viewport when the field gets focus — disorienting and slow to recover from. Chris has hit this twice. The permanent guarantee in `index.html`:

```css
@media (pointer: coarse) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea,
  select {
    font-size: 16px !important;
  }
}
```

Rules for new code:
1. **Don't write `fontSize: 14` (or anything < 16) on an input/textarea/select inline style and assume the global rule will save you** — it does, but reviewers shouldn't have to remember that. Use 16 baseline; let typography sing elsewhere (labels, helper text).
2. **Don't remove the `pointer: coarse` block** in `index.html`. If you need to scope it tighter, scope it tighter — don't delete it.
3. **`InputField` / `TextArea` / `SelectField`** in `src/components/InputField.jsx` already default to 16px — prefer them over raw `<input>` whenever practical so the baseline is built in.
4. **Before claiming a mobile UI fix shipped, focus a real input on an iOS device or simulator** and confirm no zoom.

Symptoms of regression: tap an input → viewport visibly zooms in → input loses focus or shifts under the keyboard.

## React Hook Order Rule (App.jsx specifically)

**Every `useState` / `useEffect` / `useMemo` / `useRef` declaration in `src/App.jsx` MUST be placed above the `if (authLoading) return …` early-return line.** Chris has been bit by React error #310 *three times* across different Patch runs — every time, a new hook got dropped below the early return. When `authLoading` flips false on subsequent renders, more hooks run than the first render saw → React tears the tree down → ErrorBoundary fires → bad UX.

Rules for new code in App.jsx:
1. **All in-component hook calls go above `if (authLoading) return …`.** No exceptions. The handlers (functions returned by useCallback or plain `function foo()`) can live below; hooks themselves must not.
2. **When adding state for a feature, scan App.jsx first** to confirm you're adding it above the early return. Group new hooks with the existing `useState` block near the top.
3. **Before declaring a Patch done that touches App.jsx, grep for `useState\|useEffect\|useMemo\|useRef` line numbers and confirm none are below the `authLoading` return line.**

This rule applies to Patch agents AND to Claude. Adding a one-line comment marker above the early-return helps future passes notice:

```js
// ──── HOOKS ABOVE THIS LINE ────
if (authLoading) {
  return <PipLoader />;
}
```

If you ever need a hook that legitimately depends on post-auth data (e.g. it reads `userId`), pass `userId` as a dep and let the hook no-op when null. Never gate the hook itself behind an `if`.

## Documentation Discipline Rule (presentation docs stay in sync)

Folios ships with a presentation-ready documentation suite at `docs/`
(see `docs/README.md` for the index). These are the files Chris pulls
up when someone asks "got documentation?" — they're not internal notes,
they're the leave-behinds that go to VPs / IT / compliance reviewers.

**The rule:** every code change that affects a documented capability
triggers a `docs/*.md` update in the **same commit**. No drift.

Practical guide:
1. **Before shipping a feature**, scan `docs/` for any file that
   references the surface you're changing. Grep for the feature name,
   the table name, the user-facing label.
2. **If a doc mentions the thing you're changing**, update that doc in
   the same commit. Use the Edit tool — surgical changes only, don't
   rewrite whole files.
3. **If a doc claims a security/data property you're about to change**
   (e.g. "RLS-scoped per user"), update it BEFORE shipping the change.
   Never let docs lie about security posture even briefly.
4. **If a brand-new capability lands** with no existing doc home, add
   it to the right file (usually `product-overview.md` for features
   or `security.md` / `data-handling.md` for security-relevant ones).
5. **Update the `Last updated:` date** in the file's header on every
   edit. Readers use that to gauge freshness.

What NOT to do:
- Don't update docs for every micro-tweak. Bug fixes, styling polish,
  refactors that don't change capability — skip the doc update.
- Don't write marketing fluff. These docs are credibility artifacts;
  every claim must be true and verifiable.
- Don't duplicate facts across files. Each capability lives in ONE
  canonical place; other files reference it.

When in doubt: it's better to over-update than to let docs go stale.
A reader who finds stale docs loses trust in everything else in the
suite.

**PDF regeneration:** the docs suite generates styled PDFs into
`docs/pdf/` via `npm run docs:pdf` (script: `scripts/build-docs-pdf.js`,
stylesheet: `docs/pdf-style.css`, Pip-orb header in `docs/assets/pip-logo.svg`).
After any meaningful markdown edit in `docs/`, regenerate the PDFs in
the same commit so the committed PDFs never lag the markdown source.
The script handles all 9 docs at once (skips `README.md`); takes ~5s.

**Upgrade log discipline:** every major upgrade (new feature, schema
migration, architectural change — anything that meaningfully changes
what Folios *does* or *is*) gets a plain-English entry in
`docs/upgrades.md` in the same commit. Format: date + short heading +
What I built / Problem it solves / What changed / What you see today /
Why it matters. Written for Chris to read at a glance — no jargon, no
release-note formality. Bug fixes, styling tweaks, and doc-only
updates do NOT belong in upgrades.md — those live in git history.
Technical release-notes detail still goes in `changelog.md`.

## Patch — Background Build Agent

**Patch** is the name for the background agent used to execute large batch builds. When a batch of queued items is ready to ship, spawn Patch via the Agent tool with `isolation: "worktree"` so it works in a clean copy of the repo without disrupting the main conversation.

- Patch handles the building, Claude handles the thinking
- Use Patch for multi-file batches (5+ files) to keep the main context clean
- Patch commits and pushes to `main` when done — one clean commit per batch
- The stop hook has a 10-minute grace period so Patch can work without triggering mid-batch commits
- **Default Patch to Sonnet, not Opus.** Pass `model: "sonnet"` when launching the Agent. Patch is execution-focused: the spec does the hard thinking, Sonnet just builds. ~4-5× cheaper per batch and noticeably faster than Opus, with no measurable quality regression on well-spec'd work. Reserve Opus-Patch for the rare build where mid-execution reasoning matters (e.g. an architecture refactor where Patch makes real judgment calls). Strategy + design + debugging conversations stay on Opus in the main session.

## Architecture

**Folios is the umbrella product** — a year-round account management app. Lanyard and Gauge are connected modules that live inside the Folios world, not separate apps with equal billing. The product name is **Folios** (plural); the GitHub repo is still named `Folio` (singular) for historical reasons — don't rename the repo.

- **Folios** (`chrisvasconcellos97/Folio`) — the main app. Year-round account management: accounts, meetings, cadences, contacts, open items, Pip AI. Production domain: `folioshq.com`. (Pipeline / revenue surfaces were intentionally ripped — see "Ripped (deliberate simplification)" below.)
- **Lanyard** (separate repo) — conference-specific module. Schedule, partner profiles, team chat, personal meeting notes, Pip AI. Punches out from Folios during conferences, feeds notes and partner data back.
- **Gauge** (lives under `gauge/` in this repo) — project management module. Tracks commitments and deliverables from account meetings (Phase 1), then expands to company-wide product team integration where PMs manage work and AMs are linked to relevant projects (Phase 2). Feeds project status back into Folios account views.

All three share the **same Supabase project**: `https://yrpdjmyfidhxlpmxasao.supabase.co`

### Gauge — Build Notes
- Phase 1: AM-facing. Commitments from meetings graduate into tracked projects in Gauge, visible on the account in Folios.
- Phase 2: Company-wide. Product team uses Gauge as their primary tool, AMs linked to relevant projects. Get input from OEC product team and PMs before building Phase 2 — they'll know what's missing.
- Same security model as Folios and Lanyard — shared Supabase, RLS, 2FA inherited automatically.

---

## Folios — Current State

- React + Vite, deployed on Vercel at `folioshq.com`, live as of May 2026
- Supabase Auth (real email/password accounts)
- Tables: `folio_accounts`, `folio_contacts`, `folio_meetings`, `folio_items` — all with RLS tied to `auth.uid()`. (Table names keep the `folio_` prefix — they're DB identifiers, not user-facing brand.)
- `folio_meetings` has two extra columns added post-launch: `pip_summary text`, `pip_email text`
- Pip AI proxy at `api/pip.js` using `claude-haiku-4-5-20251001`, requires `ANTHROPIC_API_KEY` in Vercel env vars
- Schema is in `supabase/schema.sql` — run in production
- ABPA 2026 import is in `supabase/import_lanyard.sql` — run in production
- 11 accounts and 8 meetings imported from Lanyard with Pip summaries and draft emails attached

---

## Lanyard — Architecture Summary

- React + Vite, hosted on Vercel (separate deployment)
- **No real auth** — uses anonymous user IDs (`lanyard_uid`) generated and stored in `localStorage`
- Supabase accessed via raw REST fetch calls (no SDK), anon key hardcoded in `App.jsx`
- Single-file app: `src/App.jsx` (~4300 lines)

### Storage pattern
- **Writes to localStorage immediately** for speed, then debounces a Supabase upsert 1.5 seconds later
- **On load**: checks Supabase first, falls back to localStorage if nothing found

### Supabase tables (Lanyard)

| Table | user_id value | What's stored |
|-------|--------------|---------------|
| `sessions` | `"abpa2026_team"` | Conference schedule events (shared) |
| `partners` | `"abpa2026_team"` | Partner/account profiles (shared) |
| `user_prefs` | `"u_<uid>"` | Hotel info, quick notes (personal) |
| `user_prefs` | `"u_<uid>_notes"` | Personal meeting notes per session (private) |
| `share_codes` | — | Temporary codes for syncing between teammates |
| `notifications` | — | Team activity feed (built, SQL not yet run) |
| `messages` | — | Team chat, DMs, shoutouts (built, SQL not yet run) |

### The auth problem
`lanyard_uid` lives in localStorage — clearing the browser or switching devices loses personal notes. Shared data (under `"abpa2026_team"`) is safe. **Adding real Supabase Auth to Lanyard is the top priority for the next Lanyard build.**

---

## Folios ↔ Lanyard Integration — Current Status

- Lanyard ABPA 2026 partner data and meeting notes have been imported into Folios
- Going forward, Lanyard will need real auth before bidirectional sync makes sense

---

## Pip

Both Folios and Lanyard use the same Pip personality — a loyal, slightly anxious field analyst. Pip has access to account/meeting context injected into the system prompt. Model: `claude-haiku-4-5-20251001`.

### Pip cost strategy
- Generate Pip outputs once, save to DB (`pip_summary`, `pip_email` columns)
- Never regenerate what's already saved — load from DB instead
- Future "Ask Pip" button should check for existing output before making an API call

### Pip context parity rule
**Both Pip entrypoints must see the same data.** There are two places Pip is called:
1. **Ask Pip chat** — `src/lib/pipContext.js` (`renderAccountFull`) + PipView.jsx
2. **Meeting summarize** — `src/lib/pip.js` (`summarizeDraftPip`) + CadenceHub.jsx

Any new field added to the data model that should influence Pip's reasoning (new table, new column, new hook) must be wired to **both**. The pip_facts gap (folio_pip_facts only wired to chat, not summarize) was discovered in May 2026 and fixed — this rule exists to prevent recurrence. When in doubt, grep for the field in both `pipContext.js` and `pip.js`.

---

## Supabase

- Project URL: `https://yrpdjmyfidhxlpmxasao.supabase.co`
- Same project for Folios and Lanyard
- Folios tables have proper RLS via `auth.uid()`
- Lanyard tables use text `user_id` fields (not auth UUIDs)

---

## Scalability Notes

This app is currently single-user but should be built with multi-tenancy in mind from the start. Every decision should assume it will eventually serve multiple businesses with multiple users per business.

- **RLS is already user-scoped** — good foundation, but team/org layer will be needed
- **Future: add `org_id` to all tables** — one org per business, users belong to orgs, RLS updates to match
- **Pip at scale** — Haiku is cheap but at volume, saved outputs (never re-call for same meeting) are essential
- **Avoid hardcoding user IDs** — `import_lanyard.sql` has a hardcoded user ID for one-time import only, never repeat this pattern in app code
- **Keep hooks thin** — data logic lives in `/hooks`, components stay presentational
- **Schema changes** — always add columns with `if not exists`, never destructive migrations

---

## Development Workflow

- Features requested by Chris go on **Pending Updates** list below
- Chris says "ship it" → everything on the list gets built in one batch
- Items drop off the list after they ship
- If items should be grouped for efficiency, suggest it before executing
- Never execute immediately on a feature request — queue it first
- **Before shipping items 4–7:** do a full layout audit first — review placement, spacing, and information hierarchy across every screen to make sure new features land cleanly into a well-organized foundation

### Idea Capture Rule (read this every session)

**Nothing Chris mentions gets discarded.** Ideas have been lost across chats — this is the fix.

- **Capture aggressively, not selectively.** If Chris says "could we also...", "what about...", "I'd love...", "I'm wondering if...", "would be nice to have...", or even floats a half-formed idea mid-conversation → it goes into **Pending Updates** or **Feature Wishlist / Roadmap** *that same turn*, before responding to anything else.
- **Even rejected/deferred ideas get logged** in the Wishlist with a one-line note on why deferred — so they resurface if context changes.
- **Asides count.** "Side note, the Departments thing would be cool" → that's an idea, capture it.
- **Tangents in the middle of another feature discussion count.** If Chris is walking through Cadence Hub and mentions a Departments tab → capture Departments immediately, don't lose it in the Cadence Hub conversation.
- **When in doubt, log it.** A half-captured idea is recoverable. A forgotten idea is gone.
- **Confirm capture out loud** when you log something new mid-conversation: "Queued under [section]." So Chris sees it landed.

---

## Pending Updates

1. *(ripped — see "Ripped (deliberate simplification)" below)*

2. **Code quality:** *(no open items)*

3. **Feature completeness:** *(no open items)*

4. **Native feel:** *(no open items)*

5. **Overview tab redesign + account intelligence:** *(no open items)*

6. **Motion design / transitions:** *(no open items)*

7. **Typography & visual rhythm:** *(no open items)*

8. **Copy & tone:** *(no open items)*

9. **Search & discoverability:** *(no open items)*

10. **Onboarding & contextual help:**

    *(Phase 1 shipped — see Already shipped: Pip onboarding interview Phase 1. Phases 2–3 below remain open.)*

    **Phase 2 — The "few questions a week" drip:**
    - `detectKnowledgeGaps()` pure-JS function, runs alongside the daily snapshot computation (app load, once per calendar day, fire-and-forget). Zero LLM cost. Inserts `folio_pip_questions` rows with `source='gap_observed'` for detected holes: contact appears in ≥3 meetings with no role recorded, active account has empty `objective` after 30 days, profile slot still null post-onboarding, same meeting theme across 3+ accounts.
    - Gap questions are template-filled from observed data (e.g. *"You've sat down with Sarah Chen three times but I don't have her role — who is she to the account?"*) — never LLM-generated in Phase 2.
    - **Terminology gap lane (Lane C)** — Pip notices a proper noun/brand appearing ≥3 times across meeting notes that isn't a known account name, contact name, or glossary entry, and asks about it. Example: *"You keep mentioning Keystone — is that a new account or tied to another?"* User answers *"That's LKQ's aftermarket brand"* → answer saves directly to `folio_pip_facts` as a glossary entry (rides the existing facts injection path, immediately visible to Pip in all future outputs). Unlike structural gaps, this lane requires a lightweight Haiku batch scan of recent meeting notes to extract unknown proper nouns — runs weekly, not daily, to stay cheap (~$0.01/month). Candidates above a frequency threshold generate `folio_pip_questions` rows with `category='terminology'`, `source='gap_observed'`, `trigger_context` holding the detected term + meeting count. This is how Pip builds up your company's vocabulary — brands, internal codenames, distributor names, program names — without you having to think to add them to the glossary manually.
    - HomeView "Pip's curious" card — one question at a time, inline answer textarea (16px+ per Mobile Input Rule), "Skip" + "Not now" dismiss. Never a modal.
    - Throttle: max 1/day, max 3 per 7-day rolling window, 48h cooldown after any skip/dismiss. Persisted in `folio_pip_questions` status + timestamps.
    - Re-synthesis trigger: when ≥3 new answers accumulated since `prose_generated_at`, fire `/api/profile-synthesis` again to update `profile_prose` + slots.
    - Evergreen question bank top-up (~15 questions): used only when gap detection produces nothing, so the well never runs completely dry.
    - Settings → "Pip's Questions" section: global pause toggle ("✕ Pause Pip's questions") to silence the drip entirely (onboarding + profile injection still work). Completeness meter (0–100%).

    **Phase 3 — Polish:**
    - Haiku-generated questions for novel gaps the templates miss.
    - "What Pip knows about you" in Settings: structured slot display (each editable inline), `profile_prose` read-only, completeness meter, "Re-run the interview" button. Editing a slot marks prose stale → re-synthesis on next batch.
    - Cross-link from the per-account "What Pip knows" panel: one-line "Pip also knows some things about you →" link into Settings profile surface.

    **Cost:** onboarding synthesis ~$0.002 once; re-synthesis ~$0.004/month; gap detection = $0 (pure JS); everything else = $0 marginal. Under $0.01/user/month total.

    **Design decisions locked:** soft-gate (route, skippable); gentle throttle (1/day, 3/week, 48h cooldown); global pause toggle in Settings; keep fully per-user in Phase 1 (org-shared profile slots deferred); never auto-route existing users — dismissible HomeView card instead.

11. **Export & sharing:** *(no open items)*

12. **Personalization:** *(no open items)*

13. **Data visualization:** *(no open items)*

14. **Gauge + account change log:** *(no open items — Gauge V3 all 6 phases shipped; see Already shipped: Gauge V3)*

21. *(shipped — see Already shipped: Inbound capture — PWA share sheet Phase 1)*

22. *(shipped — see Already shipped: Voice capture — dictation in meeting mode)*

23. *(shipped — see Already shipped: Proactive commitment enforcement)*

24. *(shipped — see Already shipped: Conversational recall polish)*

25. *(shipped — see Already shipped: Stakeholder / relationship layer)*

26. *(shipped — see Already shipped: Universal account picker search)*

27. *(shipped — see Already shipped: Smart entity detection + contact aliases)*

28. *(shipped — see Already shipped: Gauge filter by account + search bar)*

29. *(shipped — see Already shipped: Progress bar gradient)*

30. *(shipped — see Already shipped: In-meeting flow — interactive sidebar)*

15. *(shipped — see Already shipped)*

16. *(ripped — Route Builder removed, not needed)*

17. *(shipped — see Already shipped)*

18. **Internal / people cadences + 1:1 mode** — Phases 1–3 shipped — see Already shipped. Leadership tasks (items with cadence_id + null account_id) persisted as a dedicated "leadership task" type — deferred until usage patterns emerge.

18b. *(shipped — see Already shipped: Commitment auto-suggestion)*

19. **Pip portfolio intelligence upgrade (chief of staff mode)** — Pip gains cross-portfolio awareness so it can reason about work state across all accounts simultaneously. Four tiers of increasing sophistication — build Tier A first since it's the foundation everything else runs on.

    **Tier A — Account state snapshots + daily brief (build first, ~80% from existing data)**
    - **`folio_account_snapshots` table** — one row per account per day, computed nightly: health score, days since last contact, open item count, overdue count, active Gauge project count, stuck project count. Zero LLM cost; pure DB derivation. This is the foundation for everything in Tiers B–D.
    - **Portfolio work state** — All active Gauge projects + completion state + stuck detection passed to Pip in a compressed format. Powers "4 audits in flight, here's where each stands" synthesis.
    - **Daily brief** — One Haiku call per day (cached), cross-portfolio morning summary: what's due, what's at risk, what needs your attention. Estimated cost: ~$0.07/month.
    - **Win surfacing** — Recently delivered/closed work surfaced automatically for 1:1s and QBRs. Easy to forget wins when heads-down.
    - **Momentum scoring** — Health trend over time from snapshots, not just current state. "Parts Authority was at-risk, now recovering" vs "All Star drifting despite healthy score."

    **Tier B — People modeling + commitment tracking (requires new light-weight data structures)**
    - **Contact engagement history** — Log last contacted date per contact, response speed inferred from meeting frequency. "Sarah responds within 48h" vs "Mike goes quiet before renewals." Stored in `folio_contacts` or a thin engagement log table.
    - **Client-side commitment ledger** — What you promised to deliver to whom and when, pulled from Gauge projects + meeting notes. Flags at-risk commitments before they miss. Requires extracting commitments from meeting notes via a lightweight Haiku pass at summarize time, stored as structured rows.
    - **Relationship temperature from tone** — `pip_tone` already written on every summarize. Trend it over time per account: consistently positive → stable; recently cooling → flag. No extra LLM calls needed, just reading the existing field over snapshots.

    **Tier C — Pattern detection + anomaly detection (most powerful, highest leverage)**
    - **Cross-account pattern recognition** — When the same theme surfaces across 3+ accounts (e.g. "pricing concern", "integration delay"), Pip flags it as a portfolio signal worth raising to leadership. Requires meeting theme extraction (one tag per meeting via Haiku at summarize time).
    - **Anomaly detection vs own baseline** — "This account is 3× more active than your usual cadence for its tier" or "No meeting in 45 days, typically you meet every 3 weeks." Personal baseline, not industry benchmark.
    - **Capacity triage reasoning** — Pip knows your current load (open projects, cadences this week, QBRs due) so it can factor in bandwidth when briefing your boss or making suggestions. Built on Tier A snapshot data.

    **Tier D — Proactive outputs (build last, requires Tiers A–C as foundation)**
    - **Proactive standing agendas** — Before any meeting, Pip suggests talking points based on unresolved items, time elapsed, outstanding commitments, and relationship temperature. Not just for 1:1s.
    - **Draft-ahead offers** — Pip drafts a follow-up email, a status update, or a QBR slide outline *before* you ask. Triggered by: meeting completed with no follow-up logged in 48h, project milestone hit, account health drop.
    - **Boss-ready rollup** — Pip generates a 30-second spoken summary of portfolio state, formatted for your weekly 1:1 with your manager. What's strong, what needs attention, what you're asking for.

    **Data Pip needs that it's not getting today:**
    - *Feed today:* detailed meeting notes (already there), attendees (already there), account updates (already there), Gauge for all commitments (already there), contacts with roles (already there)
    - *New structures needed:* `folio_account_snapshots` (daily computed, Tier A foundation); contact engagement log (last contacted per person, thin); meeting theme tags (one tag extracted at summarize time, stored on `folio_meetings`); commitment rows extracted from notes (structured `folio_commitments` table or piggyback onto `folio_items` with a `commitment_type` flag)

    **Cost analysis:** Tier A (daily brief) ≈ $0.07/month. Tiers B–C add marginal cost only at summarize time (one extra tag extraction). Tier D adds one Haiku call per triggered draft. Total at full build: ~$0.50–1.00/month. The expensive path (querying Pip on every page load) is explicitly avoided — all intelligence is computed once, cached, and read cheaply.

20. **Pip memory transparency panel** — Per-account view of everything Pip has learned so far. Shows: corrections history (what you've edited, rejected, or added), `lessons_learned` from compressed correction log, contact classifications (who responds fast, who goes quiet before renewals), tone trend over last N meetings, pattern matches flagged across accounts. Goal: Chris can see exactly what Pip "knows" about each account and correct it if something is wrong. Lives as a collapsible panel or a "What Pip knows" button in the account detail header or CadenceHub sidebar. Reads from `pip_correction_log`, `pip_account_state.lessons_learned`, `folio_contacts`, and (once built) `folio_account_snapshots`.

**Already shipped (drop from list):**
- ✅ **In-meeting flow — interactive sidebar + project highlighting (Item 30)** — Flag project as discussed: tap any project in the CadenceMeetingMode sidebar to highlight it teal; multiple projects can be flagged; Pip receives `discussedProjectIds` in the summarize payload so it routes tasks to the right project. Inline task actions: ✓ mark done (one tap), reassign, set due date, edit title — all in-sidebar, no panel needed. Add task mid-meeting: "+ Task" button on each project opens a minimal inline form (title + assignee/due) that creates a `folio_task` immediately. Focus mode: ⊡ Focus toggle in the notepad toolbar collapses the sidebar entirely, full-width notepad for distraction-free capture. Tab = sub-bullet fix: Tab/Shift+Tab in the notes textarea now indents/outdents the current line instead of jumping focus — nested structure preserved in saved notes for Pip hierarchy parsing. `[ ]` checkbox tasks: write `[ ] follow up on pricing` anywhere in notes; `extractCheckboxTasks()` in `pip.js` injects an `── EXPLICITLY MARKED TASKS ──` block into every summarize call so Pip always includes pre-confirmed tasks; `[x]` lines are explicitly excluded. `[ ] tasks` hint shown in toolbar. No schema changes.
- ✅ **Universal account picker search (Item 26)** — `src/components/AccountPicker.jsx` shared component (search input + filtered dropdown, keyboard navigable, inactive accounts excluded, ≥16px mobile-safe). Replaces all existing account selects in `QuickTaskModal`, `ProjectModal`, `ShareTargetView`, `SetCadenceModal` (single + multi), `TaskDetailPanel`, `AddAccountModal` parent picker.
- ✅ **Smart entity detection + contact aliases (Item 27, Phase 1)** — `folio_contact_aliases` table (org-scoped, unique per alias, RLS for org members read/insert + creator delete). `useContactAliases` hook. `useEntityDetection` hook (debounced 300ms): alias → full name → unambiguous first name matching; verb-signal scoring (assignee/recipient/ambiguous). `EntitySuggestionChip` component for inline Assignee/Recipient/Ignore resolution. Wired into `TaskDetailPanel` title field. `AliasSection` on contact cards in `ContactsTab`. SQL: `supabase/entity_detection.sql` — **run in production Supabase**.
- ✅ **Gauge filter by account + search bar (Item 28)** — Live text search bar above filter pills (⌕ icon, × clear, `useDeferredValue` for perf); searches project title, description, assignee. Account filter pill row (shown when ≥2 distinct accounts): multi-select toggles, "All" clear; AND logic with scope/status/overdue filters. Both filter states persist within session.
- ✅ **Progress bar gradient: blue → teal (Item 29)** — All project completion bars in `GaugeView` (3 bar fill elements) and `LeaderProjectsView` updated from flat `C.accent` to `linear-gradient(to right, #3b82f6, var(--c-accent))`. Overdue projects stay red. Onboarding interview progress bar in `PipOnboardingView` also uses the gradient.
- ✅ **Inbound capture — PWA share sheet (Phase 1)** — `share_target` added to the PWA manifest (`vite.config.js`). New `ShareTargetView` reads `title`/`text`/`url` GET params from the OS share sheet, pre-fills a textarea, and lets the user pick an account. On confirm, creates a draft meeting pre-filled with the shared text and opens it in `CadenceMeetingMode` via `AdHocConversationFlow`. Works as a standalone full-page route when the app is launched via the share sheet, then transitions cleanly into the normal app. Phase 2 (inbound email via SendGrid/Postmark) deferred.
- ✅ **Voice capture — dictation in meeting mode** — 🎙 Dictate toggle button added to the CadenceMeetingMode notepad toolbar, next to the "Bullets on/off" toggle. Uses `window.SpeechRecognition` (Web Speech API) — continuous, final-results only, no backend. Each recognized phrase is appended as a `• bullet` to the existing notes. Recognition stops on component unmount. Gracefully falls back with a toast if the browser doesn't support it.
- ✅ **Conversational recall polish** — Ask Pip greeting updated to "What do you need to remember?" with sub-line "Ask me anything about your accounts, meetings, or commitments." Four quick-answer chips (Recap last meeting / What did I promise? / What's at risk? / Who haven't I contacted?) replace the old STARTERS and appear when the conversation is empty. Chips use the `accentFaint`/`accentLine` palette for a more intentional "action" feel. Settings "Pip preferences" section renamed to "What Pip knows about you" with updated description framing Pip as an external brain.
- ✅ **Proactive commitment enforcement** — `useCommitmentNudges` hook (client-side, zero LLM cost) queries `folio_tasks` for `is_commitment=true` rows due within 3 days or overdue. HomeView shows an amber nudge card (between daily brief and drip questions) for the most urgent commitment with Mark Done (updates status to complete) and Snooze (hides from current session) actions. "+N more" count shown when multiple commitments are pending.
- ✅ **Stakeholder / relationship layer** — `relationship_role` ('champion'|'blocker'|'neutral'|'unknown') + `relationship_note` text on `folio_contacts`. Contact cards show colored CHAMPION (teal) / BLOCKER (red) pills with click-to-edit. "☆ Role" button next to Edit opens an inline editor with role select + note textarea. Pip context (`pipContext.js`) and meeting summarize (`pip.js` `renderContactsBlock`) both emit a `── RELATIONSHIPS ──` block so every brief, QBR, and summarize sees the power map. SQL: `supabase/stakeholder_layer.sql` — **run in production Supabase**.
- ✅ **Display name in dropdowns + contacts as assignees (Item 21)** — `ownerLabel()` / `ownerInitials()` helpers in `src/lib/ownerLabel.js` resolve `full_name` → email-local-part → "Team member" so Chris's own name (not raw email) appears everywhere. `useOrg` hook patches current user row with `full_name` from Supabase Auth `user_metadata` on load. All assignee selects in `PipSummarizePreview`, `TaskDetailPanel`, `ProjectModal`, `StandingBoardView`, and `FlatTaskQueue` now render display names with an `<optgroup label="Contacts">` section listing per-account contacts as assignee options.
- ✅ **Security + broken data audit fixes (Batch A)** — Auth guard (Bearer token via `supabase.auth.getUser()`) added to `api/portfolio-brief.js`, `api/business-review.js`, `api/profile-synthesis.js`; `api/leadership-readout.js` rate-limit key switched from spoofable `req.body.userId` to verified `user.id`. `normalizePlanRow()` in `pip.js` now copies `is_commitment` flag for `new_item` and `new_task` — commitment toggle no longer silently drops. `overdue_count` → `overdue_item_count` corrected in `pip.js`, `pipContext.js`, `leadership-readout.js`. `api/pip-state-refresh.js` fixed: `folio_items` → `folio_tasks`, `folio_projects` → `gauge_projects`. `AccountDetail.jsx` and `AdHocConversationFlow.jsx` ad-hoc summarize calls enriched with contacts, meetingHistory, profileProse, facts, ownerUserId, userId; `theme` written back to `folio_meetings` on apply.
- ✅ **Pip intelligence upgrade (Batch B)** — `PipView.jsx`: `objective` field fix (was silently sending `notes:` key so account notes never reached chat Pip), tone/theme added to meeting map, `is_my_department` + `serviced_states` added to account map, per-account health computed via `gatherSignals + computeAccountHealth`. `api/pip.js`: proactive observation instruction added to `PIP_PERSONA` so Pip flags issues without being asked; `profileProse` moved to dynamic tail block (was breaking per-user cache buckets by preceding `PIP_STATIC_SYSTEM`); `Today: <ISO date>` added to tail. `pip.js`: `callCadenceBriefPip` wires contacts + pipAccountState + lessons_learned into cadence pre-call brief. `CadenceHub.jsx`: passes both to `callCadenceBriefPip`.
- ✅ **Onboarding + polish fixes (Batch C)** — App.jsx: `profilePending` now returns true when `userProfile === null && !profileLoading` so new users with no DB row enter the interview. `dismissedOnboardingCard` initialized from + persisted to localStorage. `allItems` dep array fixed to `[userId]`. localStorage throttle keys (`pip_state_refresh_last`, `pip_compression_last`, snapshot keys) now include userId suffix to prevent cross-user collisions. `PipOnboardingView.jsx`: `handleFinishLater` writes `onboarding_status: "skipped"`; progress bar fixed to `(currentIdx+1)/questions.length` (was capping at 80% on last question). `StandingBoardView` + `FlatTaskQueue`: `resolveAssignee()` helper resolves email strings to display names on kanban cards and queue rows. GaugeView threads `contacts` to StandingBoardView.
- ✅ **Pip onboarding interview Phase 1 (Pip knows my world)** — `folio_user_profile` table (one row per user: role_title, company_name, industry, portfolio_shape, primary_goal, working_style, profile_prose narrative, completeness, onboarding_status) + `folio_pip_questions` table (question queue + answer log). Both with RLS scoped to `auth.uid()`. SQL: `supabase/folio_user_profile.sql` — **run in production Supabase**. `useUserProfile` hook. `PipOnboardingView` — 5-question conversational interview, one question at a time, resumable (saves each answer as answered). Soft-gated: new users (no accounts) routed to the full interview screen; existing users get a dismissible HomeView card ("Let's go →" / "Maybe later"). Skippable at any time via "Finish later". On completion calls `/api/profile-synthesis` (new Haiku endpoint, ~$0.002 once) which compresses Q/A pairs into `profile_prose` narrative + structured slot values. `profile_prose` injected into both Pip paths (parity rule): `pip.js` `summarizeDraftPip` via `renderUserProfileBlock()` in bp2Text; `api/pip.js` `buildSystem()` prepends WHO YOU ARE block. PipView + CadenceHub both consume `useUserProfile` and pass `profileProse` through.
- ✅ **Account ownership always visible for solo users** — `AddAccountModal`: solo users (no org members) now see a "This is my account" checkbox instead of nothing; checked by default (`ownerUserId = userId`). Multi-member orgs keep the existing ChipDropdown. `AccountDetailHeader`: solo users see a "Mine" / "Not mine" pill next to the account name; clicking toggles `owner_user_id` between `userId` and null. Multi-member orgs keep the existing owner select dropdown. Pip ownership awareness was already wired in `pip.js` + `pipContext.js`. No schema changes.
- ✅ **Quick task on Home** — `QuickTaskModal` surfaced from the Home Screen quick-capture area alongside the quick email log button. Hidden account-screen quick task entry point removed. No schema changes.
- ✅ **Auto-generated meeting titles from summary** — `suggested_title` field in `summarizeDraftPip` response (already in pip.js schema). `PipSummarizePreview` shows an editable title field at the top when meeting still has a system-default title (pattern: `— MMM D`, `— YYYY-MM-DD`, or `Email/Phone/In Person/Video/Conversation — ...`). Title writes to `folio_meetings.title` on Apply via new `onTitleSave` callback — both CadenceHub and AccountDetail wire it to `updateMeeting(draftId, { title })`. If the meeting already has a custom non-default title, field is hidden entirely. No schema changes.
- ✅ **Pip unknown-person detection in summarize flow** — `unknown_people: [{name, context_snippet}]` in pip.js schema (already there). Data flows CadenceHub/AccountDetail → `PipSummarizePreview.unknownPeople` prop. "People Pip noticed" section renders at bottom of preview modal (after plan items, before Apply) when Pip returns unknown names. `UnknownPersonRow` component handles inline quick-add (name pre-filled, role + email optional) and dismiss. After successful save the row is removed from the visible list. No schema changes — rides `addContact` path.
- ✅ **Escalate task → Gauge project (→ New project / → Add to project)** — `onCreateProject` prop on `PipSummarizePreview` wires each new_item/new_task row to a "→ New project" button and a project-picker dropdown. Session-fresh projects float to the top of the picker ("From this meeting"). Selecting a project sets `gaugeProjectId` on the row which passes through `applyPipPlan` to `folio_tasks.project_id`. No new tables.
- ✅ **Major-account prioritization in all Pip briefs** — `buildPortfolioState()` in `pipContext.js` sorts accounts Major → Mid → Growth before assembling cross-portfolio context. `/api/portfolio-brief` and `/api/leadership-readout` include explicit system instruction: "Major-tier accounts carry the most revenue and relationship weight. Lead with them when surfacing risks, wins, or items needing attention." No schema changes.
- ✅ **Bug fix — silent new_task failures in pipPlanApply** — `new_task` rule in pip.js prompt hardened: "ONLY use this kind when the project_id is a UUID that appears in the Active Gauge projects list. If no project matches, use new_item instead — never invent a project_id." applyPipPlan already falls back gracefully when project_id is missing.
- ✅ **Internal / people cadences + 1:1 mode** — Phase 1 (My Department flag + Pip context injection) shipped above. Phase 2 now shipped: `folio_cadences.account_id` made nullable; `contact_id` + `cadence_scope` ('account'|'person') columns added. SetCadenceModal gets "Account / Person 1:1" scope toggle + contact picker. AccountDetail on My Department accounts shows "Leadership 1:1s" section with per-contact cadence cards and "+ Add 1:1" button. CadenceHub: null-safety audit throughout; person cadences show portfolio brief (from Tier A daily brief infrastructure) instead of account brief. CadenceMeetingMode: null-safety audit + contact name fallback in headers. CadenceView/ListView/CalendarView/WeekView: person cadences display "PERSON 1:1" badge + contact name. App.jsx: `pendingPersonHubCadenceId` state threads deep-link from CadenceView into AccountDetail. SQL: `supabase/folio_1on1_cadences.sql` — run in production.
- ✅ **Gauge template total turnaround time** — `total_duration_days` on templates + `expected_complete_date` on projects. "Est. Xd" chip when browsing templates. Creating from template sets expected complete date = today + duration. Project cards show expected date, goes amber when past. SQL: `supabase/gauge_template_duration.sql` — run in production.
- ✅ **Pip memory transparency panel** — "✦ What Pip knows" button on every account header. Opens modal showing: lessons learned (compressed from correction history), recent corrections grouped by type (summary edits, rejected rows, missed items, text corrections, routing fixes), pip_tone chip, total correction count. Read-only, no schema changes.
- ✅ **Pip portfolio intelligence — Tier A (account state snapshots + daily brief)** — `folio_account_snapshots` table (one row per account per day: health status/score, days since contact, open/overdue item counts, active/stuck project counts, pip_tone). `computeAndSaveSnapshots()` runs client-side on app load once per calendar day, fire-and-forget, uses `gatherSignals + computeAccountHealth` for consistency with AccountsView. `useAccountSnapshots` hook reads today's rows. `/api/portfolio-brief` Haiku endpoint returns a 3-5 sentence cross-portfolio morning brief from compressed portfolio data. `callPortfolioBriefPip()` helper in pip.js. HomeView: "Pip · Daily Brief" card at top, generated once/day, cached in localStorage. `buildPortfolioState()` in pipContext.js for use in 1:1 mode and leader brief. SQL: `supabase/folio_account_snapshots.sql` — **run in production Supabase**.
- ✅ **Pip portfolio intelligence — Tier B (tone trending, commitment ledger, contact engagement)** — Tone temperature trend: `src/hooks/useToneTrend.js` reads 14 days of `folio_account_snapshots.pip_tone`, scores positive/negative, derives cooling/warming/stable; `AccountDetailHeader` shows amber "Cooling ↘" or teal "Warming ↗" pill when trend has ≥3 data points. Commitment ledger: `is_commitment boolean` on `folio_tasks` (toggle ◇/✦ on each item row); `pipContext.js` emits COMMITMENTS block with OVERDUE flags; `pip_account_state` context surfaces promised deliverables before every summarize. Contact engagement: `src/lib/contactEngagement.js` derives `{ lastSeenAt, daysSince, meetingCount }` per contact from meeting attendees; ContactsTab shows "Last seen: Xd ago · N meetings" (amber when >60d stale); pipContext emits CONTACTS NOT SEEN IN 30+ DAYS. SQL: `supabase/folio_tier_b.sql` — **run in production Supabase**.
- ✅ **Commitment auto-suggestion in plan modal** — `is_commitment: true/false` added to Pip's plan schema for `new_item` and `new_task` rows. Pip sets it based on first-person promise language ("I'll get you...", "we'll have X by...", "I'll follow up..."). Pre-flagged rows show a teal "✦ Commitment" toggle in `PipSummarizePreview`; user can un-toggle before applying. `is_commitment` passes through `applyPipPlan` to `folio_tasks`.
- ✅ **Account health history sparkline** — `src/hooks/useAccountHealthHistory.js` queries last 30 days of `folio_account_snapshots` per account. Account Overview tab shows a 30-dot sparkline (green/yellow/red per `health_status`, faint for missing days). Renders when ≥2 data points exist.
- ✅ **Cross-account ⌘K search** — CommandPalette now searches `folio_meetings.notes` and `folio_tasks.title` across all accounts when query is ≥3 chars (debounced 300ms, ilike match). Results appear under "Notes" and "Items" groups with account name + excerpt. Clicking navigates to the account.
- ✅ **folio_items → folio_tasks unification** — `folio_items` retired as a write target. `useItems.js` now reads/writes `folio_tasks` directly (mapping `title↔text`, `assignee_email↔owner` in the hook so all consumers unchanged). `pipPlanApply.js` dual-write removed — items write once. `folio_items` stays in DB as read-only backup. SQL: `supabase/folio_items_unification.sql` — **run in production Supabase**.
- ✅ **My Department flag** — `is_my_department` boolean on `folio_accounts` with partial unique index (one per user). Department card gets "MY TEAM" badge + teal left border. Toggle in AddAccountModal when creating/editing a department. Pip context includes "MY TEAM: [name]" so Pip knows which team is the user's own.
- ✅ **Business Review mode** — per-account QBR generator. Date range picker + Pip synthesizes Account Connections, OEC Opportunities, and Client Opportunities sections from meetings/contacts/projects/items in range. Static Sales Metrics placeholder for user to fill from corporate systems. Copy per section + "Copy all for Claude" button for pasting into work Claude alongside revenue numbers. Lives in account detail header next to Brief Me.
- ✅ **In-app notification banner** — covered by `HomeView`, which is the entry point after login. Surfaces overdue items (count + Glow clickable), cold accounts (>45d, sorted longest-cold first), and today's cadences in a Pip narrative. Richer and more interactive than a static banner; no separate banner needed.
- ✅ **Add Contact from Meeting Hub + contact search match indicator** — `CadenceMeetingMode` sidebar Contacts section now has a `+` button that expands an inline quick-add form (name required, role + email optional). On save the contact is written to `folio_contacts` on the meeting's account and auto-checked as attending. Wired through CadenceHub ← AccountDetail and AdHocConversationFlow; mobile contacts tab gets the same form. `accountIdsWithContactMatch` in AccountsView upgraded from bare boolean to `{ name, title }` — when an account card surfaces because a contact matched (not the account name), a `CONTACT: Jane Doe · VP Sales` line appears under the account name explaining the match.
- ✅ **Ask Pip on meetings** — "Ask Pip" button on each meeting card calls the Pip API to generate a prose summary + draft follow-up email, saved to `pip_summary` / `pip_email` on `folio_meetings`. Cost-floor guard: if `pip_summary` already exists the API call is skipped entirely and the cached output is displayed. Button disappears once summarized; outputs render with a `mailto:` link and copy button.
- ✅ **Gauge V3 — three views + unified task model (all 6 phases)** — Phase 1: new `folio_tasks` table replacing `folio_items` + `gauge_projects.stages`; Pip plan-apply dual-writes both stores during transition. Phase 2: `default_lens text` column on `folio_org_members` ('am' | 'leader' | 'admin') with invite-time dropdown + smart pre-fill, existing owners backfilled to leader; Pip's system prompt branches per lens (AM = your accounts, Admin = your queue, Leader = team-wide). Phase 3: `FlatTaskQueue` flat task view + Projects/Tasks toggle (Admin lens lands on Tasks); one-time backfill SQL explodes folio_items + gauge_projects.stages into folio_tasks rows. Phase 4: discrete project templates now carry `assignee_email` + `due_offset_days` per stage and sub-stage; "Save as template" preserves both; "+ From Template" hydrates due dates from offsets relative to today. Phase 5: `LeaderProjectsView` org-wide rollup (AM/account/status/stuck filters, progress bars, "STUCK · Nd" pill when no stage completed 7d+, expandable stages-inline rows) + `TeammateDetailView` read-only drill-in via AM chip (their open tasks + project stages + projects + accounts); lens-aware default lands Leader on Leader view; 3-way Leader/Projects/Tasks toggle. Phase 6: V2-brain corrections wiring threaded through `ProjectStageEditor` + `StandingBoardView` + `MyQueueView` → `TaskDetailPanel`; post-apply account override on TaskDetailPanel fires `routed_account_changed` correction; AM "Projects I own" rollup on Gauge home shows the AM's active projects across owned accounts with progress bars + click-to-expand; org-wide assignment hints — once ≥ 3 distinct account-specific hints share the same `task_pattern` + `assignee_email`, `addHint` inserts an `account_id=null` cross-account hint so Pip auto-routes that work everywhere. PipGaugeCard sidebar (Pip narrative + Due ≤7d / Stuck 7d+ / Shipped 7d counters + Up Next · 14d + Watchlist + No-movement + Recent activity + Team load) replaces the thin one-liner on desktop; layout centers at 1100px max-width for ultrawide / split-screen. SQL: `supabase/gauge_v3_folio_tasks.sql` + `gauge_v3_default_lens.sql` + `gauge_v3_backfill_tasks.sql` all run in production.
- ✅ **Pip V2 brain — correction log + read-back + compression + missed_item + routed_account_changed** — `pip_correction_log` table (`correction_type`: summary_edit | rejected_row | item_text_edit | task_text_edit | missed_item | routed_account_changed) with RLS scoped to auth.uid(). `usePipCorrections` hook + `logCorrection(payload)` helper. Capture surfaces: MeetingsTab summary edits (on-blur diff against last-saved Pip output), PipSummarizePreview row rejections + manually-added missed items, TaskDetailPanel + ProjectStageEditor + StandingBoardView + MyQueueView item-text edits (guarded by `pip_created_at` age — only counts within 7 days of Pip creation), account-override moves. Read-back: last 10 corrections per account injected into every `summarizeDraftPip` system prompt (capped ~1000 tokens, oldest trimmed). Compression: Haiku pass every ~5 meetings compacts the log into `pip_account_state.lessons_learned`; rows older than 60 days archived. Pip Brief footer surfaces a one-liner "Pip remembers: …" when relevant lessons exist. SQL: `supabase/pip_correction_log.sql` + canonical `schema.sql`.
- ✅ **Pip's plan modal — five-fix polish pass + "Add an item Pip missed"** — (1) 22px custom checkboxes with clear empty / checked / hover states. (2) Inline-editable row titles (new_item / new_task title; update_item proposed text). (3) "see source" expander per row showing the editable `source_excerpt` Pip used to derive the row — edits feed the rejection learning loop. (4) Side-by-side diff for update rows — full current text struck-through above proposed text, expand-in-full affordance. (5) Cancel confirmation interstitial when changes are present ("Discard Pip's plan? Notes are saved"); auto-skip when no edits made. Plus a "+ Add an item Pip missed" affordance that writes a `missed_item` correction so Pip learns what it's leaving out. Pip's prompt updated to return `source_excerpt` per row.
- ✅ **Pip knowledge-base (Push 1 + Push 2 + Push 3)** — Push 1: full account context plumbs through Pip's system prompt (recent meeting history, open items + tasks, contacts with roles, recent updates, active Gauge projects). New Glossary v1 lets users register custom terms per account/org so Pip uses the company's vocabulary instead of generic phrasing. Push 2: cross-account routing — Pip's plan can return `target_account_id` to route a task off the current account onto its true home. Internal-meeting prior — Pip recognizes internal-team meetings (`account_type=internal_team`) and shifts summary tone away from customer-facing language. Push 3 (context parity): `summarizeDraftPip` now matches the chat view context — added `renderContactsBlock` (up to 8 contacts with POC/primary/leader flags + notes), `renderMeetingHistoryBlock` (last 5 summarized meetings with attendees/method/pip_summary excerpt), `renderCadenceScheduleBlock` (frequency/type/meeting_time/notes), `renderPipFactsBlock` (user-taught preferences from folio_pip_facts). CadenceHub loads `usePipFacts` and passes all four to the summarize call. Pip now has identical visibility during meeting summarize as during Ask Pip chat.
- ✅ **Pip cost optimizations (cumulative pass)** — prompt caching on every Pip endpoint (system prompt cached so per-call cost ≈ output tokens only). `pip_account_state.lessons_learned` compressed into a stable paragraph so read-back context stays small as the correction log grows. Trivial-draft skip — no Pip API call if the draft is empty or below threshold; summarize short-circuits with a local placeholder. Output token budget on summarize bumped 3× with truncation detection (if hit, the system asks for a re-summarize at higher budget).
- ✅ **Calendar — unified daily/weekly/monthly view + smarter meeting titles** — Calendar replaces the standalone Meetings view as the home for "what's happening." Daily, weekly, and monthly modes share one component. Pip generates short, email-subject-style titles per meeting so calendar entries read at a glance ("ACME Q3 cadence — invoice feed follow-up" instead of "ACME · May 28"). Account pill on every entry. Pip narrative card at the top frames the upcoming day/week ("3 cadences today, 1 follow-up overdue").
- ✅ **Home page rebuild + Quick email log + Auto-bullet notes** — `HomeView` is the new app entrypoint after sign-in: Pip narrative panels with embedded Glow clickables that route to the right surface (overdue items, cold accounts, today's cadences). Deprecates `ReturningWelcome` — HomeView does that job better and stays adaptive. Quick email log: one-shot 10-second log (contact picker + Pip action-item review), replaces the bigger overlay flow for simple "I just emailed X" captures. Auto-bullet notes: cadence meeting + quick capture textareas preserve pasted bullets and normalize markers to "• ".
- ✅ **Pip visual upgrades — state-driven mood** — `PipStateProvider` context drives orb state (idle / thinking / speaking / alert) via CSS class on `.pip`. Breathing keyframe when idle, mouth-shape pulse when speaking, alert pulse when surfacing an urgent insight. Reduced-motion gating respects user preference. Mobile floating Pip hidden on home view (centerpiece orb already there). Bottom nav tabs equal-weight (2px top-border for active state instead of pill container).
- ✅ **Stale-chunk auto-recovery + Diagnostics Copy-all** — `window.addEventListener('error', …)` pattern-matches dynamic-import failures (typically a stale build's hashed chunk no longer on the CDN) and triggers a hard reload to fetch the new bundle. Diagnostics rows in `ObservabilityView` gain a "Copy all" button on expand — full error context (stack, breadcrumbs, environment) goes to clipboard in one click.
- ✅ **Presentation-ready docs suite + PDF pipeline + upgrade log** — `docs/` directory: product-overview / architecture / security / data-handling / ai-governance / reliability / roadmap / changelog / upgrades + README index. `npm run docs:pdf` (script: `scripts/build-docs-pdf.js`) generates styled PDFs into `docs/pdf/` via md-to-pdf + Puppeteer (`--no-sandbox` for container env), Pip-branded header (inline SVG orb at canonical proportions), Letter page size, page-numbered footer. `docs/upgrades.md` — plain-English log of major upgrades for non-technical readers. Discipline rules added to CLAUDE.md: Documentation Discipline (docs update same commit as capability change), PDF regeneration after markdown edits, Upgrade log entries for every major upgrade.
- ✅ **React #310 fix + Modal focus-stealing fix + suggested-task wrap** — `pillWorkspaceType` hooks hoisted above the `authLoading` early-return in App.jsx (no more hook-count mismatch on second render). Modal's focus-trap effect deps simplified so it doesn't re-fire on every parent re-render and steal focus mid-typing. Suggested-task chips wrap on mobile instead of clipping past viewport edge. React Hook Order Rule added to CLAUDE.md to prevent a future regression.
- ✅ **Gauge project drafts** — X-closing a new `ProjectModal` with content prompts "Save as draft?" (in-modal interstitial with Save / Discard / Keep editing). Draft saved via `status: "draft"` on `gauge_projects` (check constraint updated in `supabase/gauge_project_drafts.sql` and canonical `schema.sql`). Draft cards float to top of the project list, render at 0.65 opacity with a yellow `DRAFT` pill and yellow border tint. Clicking a draft card opens `ProjectModal` in "Draft Project" edit mode; the Save button says "Publish Project" and promotes status to `"planned"`. `statusDraft` token added to `colors.js` + both theme palettes in `index.html`.
- ✅ **AccountsView v2 — Pip-computed health + override modal** — `src/lib/accountHealth.js` with pure `computeAccountHealth` + `gatherSignals` (tier-aware thresholds: Major/Mid/Growth, override with expiry path, 'new' status for accounts < 7 days old). `AccountHealthOverrideModal` for pinning Watching/At Risk with reason + optional expiry date. AccountsView: removed StatusBanner, QuickActionBar, stats grid, new-user checklist; added workspaces segmented pill (shows only when departments or partners exist); card left-edge border driven by computed health; micro health caption per card (e.g., "3 OVERDUE", "45D COLD"). AccountDetailHeader: computed health pill + reason text + 📌 badge + click-to-override. AddAccountModal: status field removed (health is computed, not set manually). Silent enrichments: `pip_tone` field added to `summarizeDraftPip` response and written on summarize in all three call sites; `pip_promise_log` ledger written fire-and-forget on `closeItem`; periodic `pip_account_state` refresh (top 10 recently-active, throttled 6h) in App.jsx; `renderAccountFull` in pipContext emits status override line when set. Desktop nav: Departments + Partners entries removed (navigation via workspaces pill). SQL: `supabase/account_health.sql` + canonical `schema.sql` updated with override columns, `pip_tone`, and `pip_promise_log` table.
- ✅ **Mobile responsiveness pass** — standardized every ad-hoc viewport check on `useBreakpoint()` (900px). AccountsView stats grid stacks to 2 cols on mobile, search row's filter buttons drop below the input, page header uses size-32 Mark + 26px title. AccountDetailHeader title drops to 26px, right-side revenue/cadence/buttons column moves below the title block, pill row gains `overflow:hidden` + scoped 9px/`2px 7px` sizing via `.acc-hdr-pills`. StartConversationModal method picker collapses to single column. CadenceMeetingMode now starts collapsed below desktop breakpoint, sidebar width caps to viewport-friendly 320px when expanded on mobile, vitals strip flattens to a single one-liner, top-bar Summarize button shrinks to "Summarize ✦", notepad padding tightens to 14/16. GaugeView stats grid stacks to 2 cols on mobile, header stacks vertically and uses size-32 Mark. StandingBoardView kanban stacks to single-column (no horizontal scroll). MyQueueView project-title button truncates with ellipsis. MobileLayout "+ Account" button tightens to 10px/5×10. Modal already capped maxWidth to viewport − 16px and padded 8px on mobile — left intact.
- ✅ **Unified Log Conversation flow** — Ad-hoc conversations now use the same full-screen `CadenceMeetingMode` as cadence meetings. New `StartConversationModal` (searchable account picker when global, required method + date) drops a draft meeting with `cadence_id=null` and hands off to the meeting overlay. `CadenceMeetingMode` gracefully handles a null cadence (method label in top bar, Pip-brief panel skipped) and the sidebar Contacts list is now a multi-select that debounces into `folio_meetings.attendees`. End & Summarize routes through the same `PipSummarizePreview` plan flow. Ad-hoc meetings land in History with the `AD-HOC` pill via the existing `cadence_id` check. New `AdHocConversationFlow` wrapper hosts the overlay when launched from the global "+ Conversation" pill so account-scoped hooks load once. Deprecates and deletes `QuickMeetingModal` + `LogConversationModal`; QuickActionBar's inline meeting mini-form removed in favor of the unified modal.
- ✅ **Revenue-impact Update Calendar v1** — `folio_account_updates` table (SQL in `supabase/account_updates.sql`, mirrored into canonical `schema.sql`) keyed on `account_id` with `update_date`, `update_type` (catalog / pricing / integration / product_launch / training / promo / external_event / other), `title`, `description`, `owner` (free text + member typeahead), `observed_impact`, optional `gauge_project_id`. `useAccountUpdates` hook + realtime sync. New "Updates" tab on AccountDetail with its own animated `updates` Mark glyph (timeline ticks + breathing event flag, 6.2s cycle) registered in `Mark.jsx`. `AddUpdateModal` with hybrid owner input. "Recent updates" tile on Overview (last 5, links into the full tab). Revenue sparkline gets thin colored ticks per `UPDATE_TYPE_COLORS` at each `update_date`; hover tooltip shows title + owner + date. Pip context grows a `recentUpdates` block per account (top 6) so revenue-dip questions can cross-reference what changed. Manual entry only in v1 — supplier-side / customer-internal blind spots remain; v3 (auto-ingestion webhook) deferred.
- ✅ **Folios design system refresh** — unified `Mark` component (10 tab marks + Pip brand) in `src/components/Mark.jsx` with shared rAF engine: page-size marks (>=52) animate per the README spec (accounts dossiers drift, departments cycle, partners breathe, meetings seats sequence, pipeline bars rise, cadence dot orbits, gauge needle sweeps, team triad pulses, route tracer travels, settings knobs glide); rail (22) + compact (32) stay static. Loop self-starts on first registration and stops when idle. Reduced-motion gating disables both rAF registration AND the CSS glow keyframe. Rail marks pick up `active` prop → 2.8s `fol-mark-active` pulse. `LitPill` component (Mist fill + teal border + glow + pulsing teal pip dot) — desktop rail "+ Account/Department/Partner" footer CTA migrated. L-connector for nested child accounts (`.acct-child::before` draws teal L with double drop-shadow). Sidebar Mist background in light mode via new `--c-rail-bg` token (desktop rail + mobile header + bottom nav). Stat-tile tier-tinted halos (`stat-tile-watching` ochre, `stat-tile-risk` terracotta) light-only. `rgba(255,255,255,0.04)` overlays across 5 modals tokenized via `--c-input-fill`. `rgba(0,0,0,0.X)` shadows in Toast / Modal / CommandPalette / UserMenu tokenized via `--c-overlay-shadow*`. NavMark kept as a thin alias to Mark for diagnostics + back-compat.
- ✅ **Cadence meeting reminders (Pip pre-call nudges)** — `useCadenceReminders` hook ticks every 30s, computes each cadence's next occurrence via `getNextOccurrence` + `meeting_time`, fires three thresholds (30m / 5m / start) as in-app `MeetingReminderBanner` rows at the top of the app. Fired + dismissed sets persist in localStorage (`folio_cadence_reminders_fired` / `folio_cadence_reminders_dismissed`) so a refresh never replays. Browser `Notification` API fires system pop-ups when permission granted. One-time discreet "Want Pip to ping you?" prompt surfaces the first time a cadence with a `meeting_time` exists. Settings → Cadence Reminders section adds a browser-notifications request + in-app banners toggle. Start-tone banner CTA threads `autoOpenMeetingMode` through AccountDetail → CadenceHub, which programmatically clicks Start Meeting on mount (auto-creating today's draft and opening `CadenceMeetingMode`). Skips cadences without `meeting_time`, inactive accounts, and stale reminders (>6h past start).
- ✅ **Smarter Pip summarize + preview modal** — `summarizeDraftPip` now receives existing open items + in-flight Gauge tasks + org members + learned assignment hints, and returns a structured `plan[]` (new_item / update_item / close_item / new_task / update_task / skip) instead of a flat action-item list. The new `PipSummarizePreview` modal renders the plan with checkboxes + assignee dropdowns + due-date inputs, grouped into Changes / New / Skipped, with yellow dots on low-confidence rows. Apply runs the selected rows through `addItem` / `updateItem` / `closeItem` / `updateProject` (project stages batched per project for one round-trip). Assignee overrides are persisted into `pip_assignment_hints` (`account_id`, normalized `task_pattern`, `assignee_email`) via `usePipAssignmentHints`, fed back into Pip's next summarize. Wired into both DraftCard (Cadence Hub) and CadenceMeetingMode (full-screen). Cancel preserves the summarized meeting but applies nothing. Falls back gracefully to synthesized new_item rows if Pip returns the legacy flat shape. SQL: `supabase/pip_assignment_hints.sql` (run manually) + canonical `schema.sql`.
- ✅ **Multi-phase hardening pass (8 phases)** — Security (RLS holes patched, Pip prompt-injection guards, autosave/signout wipes, rate limits). Reliability (fetch timeouts, autosave-failure toasts + localStorage backup, top-level + view-level ErrorBanner Retry, double-click guards, `src/lib/net.js` with retry/timeout/timed). Pip cost (folio_pip_usage table + RLS, prompt caching on ask-pip & pip-state-refresh, Sonnet→Haiku downgrade for brief/summary/email, MeetingsTab + CadenceHub short-circuits, Pip Usage tile + details modal in Settings). Code quality (AccountDetail -42%, OverviewTab -29%, useBreakpoint extracted, accountInsights.jsx extracted, 24 new tests). Data integrity + export (19 hot-path indexes, gauge_projects cascade flipped to set null, canonical schema.sql sync, per-account JSON export). Observability (folio_errors table + RLS, ErrorBoundary at App + per-Suspense, window.onerror + unhandledrejection, Diagnostics nav with badge, ObservabilityView, `timed()` helper). Accessibility (skip-to-content, aria-live on Toast + StatusBanner, ARIA combobox/listbox on CommandPalette, account-card aria-label with tier/status, WCAG AA contrast bumps for light-mode `--text-mute`/red/blue, global `prefers-reduced-motion`, `:focus-visible` outline, `pointer: coarse` 44×44 tap targets, tier label in compact mode). Multi-device realtime sync (Supabase Realtime subscriptions on every data hook, ~500ms debounced refetch on change, ConnectionStatus indicator only on drop, visibility-change reconnect).
- ✅ **Inactive / Archive + Account Merge** — `is_inactive`, `inactivated_at`, `merged_into_account_id` on `folio_accounts`; `is_inactive`, `inactivated_at` on `folio_org_members`. Postgres `folio_merge_accounts(source, target)` re-parents every child row atomically. Hide-inactive toggle per workspace, INACTIVE/MERGED pills, Reactivate + Merge-into UI. Inactive users blocked from sign-in. Pip insight + StatusBanner exclude inactive from rollups.
- ✅ **Light theme + Settings toggle** — token swap via CSS custom properties on `[data-theme]`, pre-mount inline script prevents flash, `useTheme` hook persists to localStorage. Tier-colored halos on light account cards, paper Pip-card. Both themes inherit the same component grammar.
- ✅ **Cadence Hub V2 — prep dashboard + full-screen meeting mode** — Hub became a pre-call command center: Pip brief, big "Start Meeting" CTA, inline-expanding Gauge project cards (StandingBoardView/ProjectStageEditor inside), open items, follow-ups, history widened to ALL meetings on the account with `CADENCE`/`AD-HOC` tags. Start Meeting auto-creates a draft (`"{Cadence label} — {date}"`), reuses today's draft if one exists, then opens `CadenceMeetingMode` — a portal-based full-screen overlay that covers the global chrome with a top bar (close + End & Summarize), a collapsible left sidebar (Pip brief / projects / open items / contacts), a viewport-filling notes textarea, and a quick action-item add. Autosaves every 1.5s, ESC closes, "End & Summarize" runs the existing Pip flow.
- ✅ **Cadence Hub** — per-cadence all-access workspace. Active drafts, summarize-with-Pip flow (writes action items into folio_items), meeting history, open items + follow-ups. Mobile 4-tab segmented control. Backfill banner inside hub.
- ✅ **Workspaces (Departments + Partners)** — `account_type` extended; AccountsView reused with `typeFilter`. Desktop 3-flat-item nav with divider; mobile collapsible Workspaces group. Conditional UI per type (no revenue/pipeline on Dept/Partner; partner-only agreement-end/scope/billing/spend fields). Pip context branches per type.
- ✅ **Account owners** — `owner_user_id` on `folio_accounts`. Owner picker in AddAccountModal (when org > 1). Header initials chip + reassign dropdown. "Mine" filter chip in workspace lists.
- ✅ **Activity audit trail** — Settings → Activity section. Owner sees org-wide feed, non-owner sees own actions. Filters: time range / account / event type / user (owner-only). Pagination via `useActivity` hook reading `folio_activity` (already populated by every write hook).
- ✅ **Pip card / nav / page conventions** — NavMark component with per-section SVG marks (folders/grid/circles/pawn/bars/speedometer/orb/triangle/route/exclamation). Each main page header shows its mark next to the Fraunces title. Glow component for inline clickable highlights inside Pip prose (used by StatusBanner + every PipInsightCard). ErrorBanner for hook-error retry. AddToTasksButton for action-item → task promotion.
- ✅ **Demo data seed script** — `scripts/seed-demo-data.js` populates a Supabase Auth user with ~50 accounts (mixed tiers/types, ~4 inactive), ~150 contacts, ~400 meetings, ~300 items, ~25 cadences, ~20 Gauge projects, 25 quick tasks. Idempotent (wipes prior demo data first). Requires `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` in `.env`.
- ✅ Data Visualization — 8-point sparklines + MoM trend arrows on account cards (later ripped — see "Ripped" section); 6-month meeting frequency bars on account detail header (KEPT)
- ✅ Gauge + Account Change Log — deliveries in Brief Me, active projects fed into Pip context, Recent Deliveries on Overview (already shipped)
- 🪓 **Route Builder (ripped)** — TSP optimizer, Nominatim geocoding, schedule sidebar, Google Maps handoff. Removed — not used in practice. Nav item gone, `src/views/routes/` deleted, lazy import removed from App.jsx. DB columns intact if needed later.
- ✅ Team/Org Layer + Leadership View — `folio_orgs`, `folio_org_members`, `folio_account_notes`, `folio_activity` tables + migration SQL (`supabase/team_org_layer.sql`). `useOrg` hook, `useAccountNotes` hook (migrates from `account.objective`), fire-and-forget `logActivity` in all write hooks. Settings view with create-team + invite/revoke UI. Leadership view (full-width read-only portfolio dashboard). Invite banner on login. Role-aware rendering: leadership gets LeadershipView; everyone else gets normal app. "Team" nav item on desktop sidebar. "Settings" in UserMenu (mobile).
- ✅ **Gauge — Standing Projects + Custom Columns + Admin Queue** — `is_standing`, `custom_field_schema`, `task_status_columns` columns on `gauge_projects` (migration in `supabase/gauge_standing_projects.sql`). Per-task `custom_fields`, `account_id`, `task_status`, `created_at` inside the existing `stages` jsonb array. `src/lib/gaugeFields.js` defines field types (text/longtext/number/date/dropdown/person/checkbox/url) and seeds "bones" defaults (Priority, Owner, Submission Date, Due Date, Description, Related Link). `ProjectModal` now has a Discrete/Standing mode toggle + inline `CustomFieldSchemaEditor` for managing columns. Unified `TaskDetailPanel` handles both new-task and edit-from-queue flows with every custom field rendered by type. `StandingBoardView` renders the kanban (one column per `task_status_columns` id) inside the expanded project row. `MyQueueView` flattens tasks across all projects assigned to the current user with Live / Planning / All sub-filters and an optional group-by-project toggle. Project status bubbles into task display via `PLANNING` / `ON HOLD` chips on planned/on_hold projects. "Stages" renamed to "Tasks" everywhere user-facing; DB column name stays `stages` for backwards compat.
- ✅ Gauge V2 — stages, requested_by, assignee multi-user RLS, My Queue filter, New Request from Folios, status values fixed (planned/in_progress/blocked/complete/on_hold)
- ✅ Quick Tasks — tray on main page, modal with account dropdown + reminder presets, Pip integration (surface open tasks on load, complete/add via natural language)
- ✅ Sub-accounts — UI + migration (`parent_account_id` column live), nested display with faded ↳ arrow on accounts list
- ✅ Pip Summarize with date range (30d / 90d / all time presets, saves to account)
- ✅ Cadence (full nav item, per-account editor, calendar view, open items carry forward)
- ✅ Last interaction tracking (`last_interaction_at` drives days counter on account cards)
- ✅ MSO prep — `account_type`, `address`, `lat`, `lng`, `account_number` columns live on `folio_accounts`. Account type toggle in AddAccountModal. MSO accounts get a Shops tab showing child shops with address, status, last-visit. Shop count chip on MSO cards. Address and account number display in account detail header.
- ✅ Pip cards — PipelineView and MeetingsView both use `PipInsightCard` with memoized insight builders
- ✅ Pip Voice Chat — mic button in Pip input bar, Web Speech API for input, SpeechSynthesis for output, speaker toggle, silence auto-send
- ✅ Performance — `useMemo` on all filter/sort chains in AccountsView, all insight builders memoized, CadenceView keys stable
- ✅ PWA — vite-plugin-pwa configured, offline cache for accounts + meetings in localStorage, theme-color meta tag
- ✅ DX — ESLint + react-hooks plugin, GitHub Actions CI (lint + build), Vitest with utility tests
- ✅ Edit modals — EditMeetingModal, EditContactModal, and edit mode in AddItemModal all built and wired
- ✅ Error resilience — error state in all hooks (useAccounts, useMeetings, useItems, useContacts, useCadences, useProjects, useAccountMetrics, useQuickTasks), pip.js has AbortController timeout + retry + 429 handling
- ✅ Toast notifications — Toast component, useToast hook, wired into all CRUD operations
- ✅ Delete confirmations — "Sure?" two-step pattern on MeetingsTab, ContactsTab, QuickTaskModal
- ✅ Escape key closes modals — useEffect in Modal.jsx
- ✅ Focus trap in Modal — moves focus on open, returns to trigger on close
- ✅ FL → label refactor — FieldLabel renders `<label>` with htmlFor; InputField has matching id props
- ✅ ChipDropdown extracted — `src/components/ChipDropdown.jsx`, replaces duplicate patterns in SetCadenceModal, QuickTaskModal, AddAccountModal
- ✅ Color tokens — `C.bgDropdown`, `C.accent` opacity variants in colors.js
- ✅ aria-live on Pip message list
- ✅ aria-labels on Modal close, ItemsTab checkbox, Pip send/mic/mute buttons
- ✅ QuickTaskModal saving state — button shows "Saving…" while in-flight
- ✅ Pip auto-scroll — useRef + scrollIntoView on message append
- ✅ attendees column — `attendees text[]` live on `folio_meetings` in production DB
- ✅ pip_email mailto — "Open in Mail" link (`mailto:?body=...`) in MeetingsTab
- ✅ Schema sync — `phone`, `email`, `linkedin` live on `folio_contacts`; `schema.sql` is canonical
- ✅ UX polish — actionable empty states (all 4 views), modal close padding, checkbox tap area all done
- ✅ Error resilience — fire-and-forget metadata updates have `.catch()` error logging; error state in all hooks
- ✅ a11y — calendar nav `‹›` aria-labels, `role="button"` on CadenceView cells/account cards/week-view events, `aria-live` on all error containers
- ✅ Motion — slide direction tracked in state, `view-slide-left/right` + `tab-slide-left/right` CSS classes applied on all nav transitions and tab switches, directional back
- ✅ rgba consolidation — all 78+ hardcoded `rgba(74,155,130,*)` values replaced with C tokens across 28 files
- ✅ Native feel — overscroll-behavior, tap-highlight, safe area insets, 16px inputs, user-select:none, active/pressed states, scroll reset on view change all shipped
- ✅ Staggered list load — `list-item` + `animationDelay` on account cards, meeting rows, contact entries
- ✅ Mobile sheet modal — `modal-sheet` CSS class on Modal.jsx inner panel, sheetUp keyframe in index.html
- ✅ Crossfade view transitions — replaced directional slide with 0.18s opacity fade; cards phase in via list-item stagger
- ✅ Cursor consistency — `cursor: pointer` + `role="button"` audited across all interactive divs; GaugeView project rows fixed
- ✅ Button labels — "Save Meeting" → "Log Meeting", edit-mode saves → "Done", add-mode labels already correct
- ✅ Section headers — "Auto Health" → "Health", "Follow-up" → "Follow-up Due", "YTD Revenue" → "Revenue YTD"
- ✅ Tabular nums on all figures — dates, counts, revenue, percentages, day numbers across 6 files
- ✅ Consistent label spacing — 10px/700/uppercase/0.07em standardized across MeetingsView, CadenceView, PipelineView
- ✅ Line height audit — multi-line text containers standardized to 1.5/1.6
- ✅ Default tab per account — localStorage remembers last tab per account (`folio_default_tab_<id>`)
- ✅ Dashboard density toggle — ⊟/⊞ toggle on accounts list, compact mode tightens cards and hides secondary info
- ✅ Global search — name, tags, region, account number, and notes/objective all searchable from accounts list
- ✅ Search history — last 5 queries in localStorage, shown as chips when search is focused and empty
- ✅ Desktop command palette — ⌘K/Ctrl+K overlay, searches accounts + nav, arrow-key navigable
- ✅ First-run empty states — guided empty state with CTA when zero accounts; terse "no match" when filtered empty
- ✅ Contextual tooltips — one-time first-encounter tooltips on Cadence, Gauge, Pip nav buttons (mobile)
- ✅ New user checklist — "Add account / Log meeting / Set cadence" auto-dismisses when all three done
- ✅ Share meeting summary — "Copy Summary" button on meeting cards, clipboard text block with notes + action items
- ✅ Export contacts to CSV — "Export CSV" button on Contacts tab, properly quoted CSV download
- ✅ Print account sheet — "Print" button in account header, hidden print-only layout via @media print
- ✅ CadenceView file split — CalendarView, WeekView, ListView, cadenceShared extracted; CadenceView.jsx down to ~200 lines
- ✅ Persistent filter prefs — filter state persisted to localStorage in AccountsView
- ✅ Empty state copy — "Nothing here yet — add your first account and I'll get to work"
- ✅ Error message copy — "Couldn't delete/save — check your connection" across MeetingsTab, ContactsTab, ItemsTab
- ✅ Click-to-call — phone numbers wrapped in `tel:` links in ContactsTab
- ✅ Cadence carry-forward stopgap — "Log Task" button on task cadences in CadenceView (List, Calendar views)
- ✅ Quick notes scratchpad — editable textarea for `account.objective` on Overview tab, auto-saves on blur
- ✅ Follow-up due date — surfaces `follow_up_date` from last meeting on Overview; overdue badge on account cards
- ✅ Health auto-score — calculated green/yellow/red from days since last contact, overdue items, follow-up status; shown alongside manual status on Overview
- ✅ Brief Me modal — "✦ Brief Me" button on account detail header; Pip generates pre-call brief (last meeting, open items, contacts, sharp observation); caches per account
- ✅ Multi-select email contacts — checkboxes on Contacts tab; "Email Selected" builds mailto with all checked addresses
- ✅ Rebrand to Folios — product name changed from Folio to Folios across all user-facing copy, PWA manifest, page title, invite emails, print export, Pip system prompts (Folios + Gauge). "Briefcase Suite" framing dropped; Folios is now the umbrella with Lanyard/Gauge as connected modules. Domain `folioshq.com` live on Vercel/Porkbun.

## Ripped (deliberate simplification)

Personal Mode focus. Schema stays for future re-build when corporate data integration lands.

- 🪓 **Pipeline V2 + Revenue History + Shop Metrics + revenue surfaces (May 2026)** — the Pipeline nav item, `PipelineView`, Log Month modal, MoM/YoY deltas, sparklines on account cards, MoM trend arrows, revenue display in account card meta + account detail header, Revenue YTD + Revenue Trend + Shop Connections cards on Overview, revenue input on AddAccountModal, Shop Metrics overlay, `useAccountMetrics` hook, financial helpers in `metricsUtils.js` (`displayRevenue`, `fmtRevenue`, `momPct`, `yoyPct`, `momDelta`, `fmtPct`, `fmtDelta`, `latestRecord`, `accountRecords`, `MONTH_NAMES`, `parseRevenueText`), `metricsUtils.test.js`, "revenue" sort option, pipeline mark in Onboarding tour, Pipeline filters from the wishlist, "Revenue/tier/pipeline don't apply" notes in Pip context, revenue/shop secondary-signal sentences in `accountInsights.jsx`, `revenueTrend` + `shopConnections` in PipView context payload. DB columns (`revenue`, `revenue_amount`, `folio_revenue_history`, `folio_shop_metrics`) intact. ShopsTab on MSO accounts stayed (operational child shop list). `pickV` survives in `metricsUtils.js` because it's reused across non-financial insight builders. The `pipeline` glyph in `Mark.jsx` stays in the family. Why: Folios is a notepad-on-steroids / external brain — revenue surfaces showed empty data and made the app feel busy without delivering value. Compliance blocks real revenue ingestion for the foreseeable future; git history is the safety net.

**Security hardening — shipped in code, two items need Supabase dashboard toggle:**

- ✅ Rate limiting on Pip API (20 req/min per user, in-memory)
- ✅ Hardcoded anon key removed — env vars only
- ✅ Audit log SQL written (`supabase/audit_log.sql`) — run when ready
- ✅ Session timeout — 60 min inactivity auto-logout
- ✅ Password strength enforcement — 8 chars, uppercase, number required on signup
- ⚙️ **Email verification** — enable in Supabase Dashboard → Auth → Settings → "Enable email confirmations"
- ⚙️ **2FA (TOTP)** — enable in Supabase Dashboard → Auth → Settings → "Enable MFA"
- 🔜 Active sessions page — UI to view/revoke sessions (not yet built)

---

## Feature Wishlist / Roadmap

High and medium priority items are now in the **Pending Updates** queue above.

### Cadence (once built)
- [ ] **Cadence analytics** — meeting frequency per account, open item age, account health trends over time, Pip flags accounts untouched in 30+ days. Hold until enough data exists to make it meaningful.
- [ ] **Power BI integration** — connect Supabase directly to Power BI via Postgres connection string for full dashboard reporting. No special integration needed, just expose the DB connection. Hold until data volume justifies it.

### Future / bigger features
- [ ] **Render thrash detector** — Phase 6 observability catches React errors and uncaught exceptions, but it doesn't catch infinite render/refetch loops (the app isn't crashing, just spinning). Example bite: the Activity dropdown strobing because `fromDate` recomputed `Date.now()` every render → filters identity changed → useActivity refetched in a loop. The error boundary never fired. Idea: lightweight render-rate detector at the App level — if a hook's effect fires > N times in M seconds, log a `error_type='render_thrash'` row to `folio_errors` with the suspicious hook name + stack. Surfaces silent perf disasters before users notice the fans spinning. Not v1.
- [ ] **Unified org vocabulary layer** — aliases (item 27), the glossary (`folio_pip_facts`), terminology gap-detection (item 10 Lane C), and account/brand mappings are all the same thing wearing different hats: "what this team calls things." Once each piece is mature, collapse them into one shared org-scoped knowledge base that every Pip surface reads from — one place that holds brands, internal codenames, distributor names, program names, person shorthands, and preferred phrasing. This is what makes the whole app feel like it *knows you*. Don't build until the constituent pieces (27, glossary, 10-Lane-C) have shipped and proven their shape; this is the consolidation pass that unifies them.
- [ ] **Lanyard real auth** — connect Lanyard users to Folios users via Supabase Auth
- [ ] **Lanyard → Folios live sync** — post-conference notes flow into Folios automatically once auth is shared
- [ ] **CRM integrations** — Salesforce / HubSpot sync
- [ ] **Mobile app** — React Native wrapper or PWA improvements
- [ ] **Revenue-impact Update Calendar v3 — Ambitious (supplier webhook / portal / email parser)** — deferred follow-up. The v1 build (manual entry + external_event type) shipped — see Already shipped: Revenue-impact Update Calendar. v3 would add an auto-ingestion lane so supplier-side and customer-internal changes get logged without manual entry. Big lift; revisit when v1 has enough data to prove the value.

---

## Open TODOs

- [ ] Add real Supabase Auth to Lanyard
- [ ] Run `notifications` and `messages` SQL in Supabase to activate Lanyard features
- [ ] Connect Folios and Lanyard bidirectionally once Lanyard has real auth
