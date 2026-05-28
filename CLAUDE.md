# Folios — Claude Development Context

## Deployment Rule
**Vercel production branch is `claude/build-folio-desktop-app-XzvZ5`.** Always push to both `main` AND this branch on every commit:
```
git push origin HEAD:main
git push origin HEAD:claude/build-folio-desktop-app-XzvZ5
```
**Do NOT push to any other branches** — every branch push counts toward Vercel's deployment limit. Now on Pro plan so limit is much higher, but still avoid unnecessary branch pushes.

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

## Patch — Background Build Agent

**Patch** is the name for the background agent used to execute large batch builds. When a batch of queued items is ready to ship, spawn Patch via the Agent tool with `isolation: "worktree"` so it works in a clean copy of the repo without disrupting the main conversation.

- Patch handles the building, Claude handles the thinking
- Use Patch for multi-file batches (5+ files) to keep the main context clean
- Patch commits and pushes to `main` when done — one clean commit per batch
- The stop hook has a 10-minute grace period so Patch can work without triggering mid-batch commits

## Architecture

**Folios is the umbrella product** — a year-round account management app. Lanyard and Gauge are connected modules that live inside the Folios world, not separate apps with equal billing. The product name is **Folios** (plural); the GitHub repo is still named `Folio` (singular) for historical reasons — don't rename the repo.

- **Folios** (`chrisvasconcellos97/Folio`) — the main app. Year-round account management: accounts, meetings, pipeline, contacts, open items, Pip AI. Production domain: `folioshq.com`.
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

1. **Pipeline V2 + Revenue History + Shop Metrics:**
   - Revenue field formatting — convert free-text revenue to a number type with currency display + proper sorting

2. **Code quality:** *(no open items)*

3. **Feature completeness:**
   - "Ask Pip" button on meetings — generates summary, cleaned notes, draft email on demand; caches to `pip_summary` / `pip_email` so it's never regenerated
   - Pip context improvement — pass full account history (all meetings, open items, contacts) into Pip system prompt
   - Auto-create open items from meeting action items — checkbox in Add Meeting modal to promote each action item to an open item
   - In-app notification banner — shows on login: accounts gone cold, items overdue, follow-ups due this week
   - *(shipped — see Already shipped: Cadence meeting reminders)*
   - *(shipped — see Already shipped: Smarter Pip summarize + preview modal)*
   - **Cadence Hub** — per-cadence all-access workspace. Locked spec:
     - **Schema:** add `cadence_id` (nullable uuid → `folio_cadences`), `method` ('phone'|'email'|'video'|'in_person'), `status` ('draft'|'summarized') to `folio_meetings`.
     - **Rename:** "Log Meeting" → "Log Conversation" everywhere (account detail button, quick actions banner `+ Meeting` → `+ Conversation`). DB stays `folio_meetings`.
     - **Log Conversation modal:** method dropdown + cadence dropdown. If account has cadences → cadence required (all conversations filter into the hub). If account has no cadences → conversation logs without a cadence and lives in the account's Meetings tab.
     - **Hub layout (desktop):** opens from CadenceView (calendar/week/list) and account detail page. Sections top-to-bottom — Pip brief (cached + manual refresh) → Active drafts → "+ New conversation" → Meeting history (this cadence) → All open items on account → Scheduled follow-ups.
     - **Hub layout (mobile):** compact header (cadence name, last/next, Pip brief collapsed one-liner that taps to expand). 4-tab segmented control below: **Notes** (default — active drafts + new conversation) / **History** / **Tasks** / **Follow-ups**.
     - **Drafts:** running scratchpad per meeting, private to author. Multiple drafts can coexist. Stale flag for drafts >7 days unsummarized. Summarize → Pip generates summary + action items (with optional promised dates) + follow-up dates → status flips to 'summarized', moves into history. Summarized meetings stay editable.
     - **Cadence next-due:** auto-advances when a conversation is logged tied to it.
     - **Account Meetings tab:** stays as all-cadence rollup view (and home for cadence-less conversations on accounts without cadences set up).
     - **Backfill:** one-time per-account prompt to assign cadences to existing meetings.
     - **Open discussion (not in v1):** how action items / promised deliveries feed into Gauge.
   - **Departments tab** — internal-teams workspace (marketing, sales, product, ops, etc). Click a department → full hub for working notes, tasks, conversations with team leads, optional cadences. Two modeling options to decide before build: (a) separate top-level concept with new `folio_departments` table, distinct nav, no revenue/shop fields — clean separation; (b) reuse `folio_accounts` with `account_type = 'internal_team'` alongside `mso`/`shop` — free reuse of Cadence Hub, conversations, contacts, Pip stack. Lean toward (b) so internal teams inherit the same workflow muscle, with conditional UI hiding revenue/shop sections for `internal_team` type. Decide whether to fold into Cadence Hub build or ship after.
   - **Workspaces — Departments + Partners (locked spec):**
     - **Model:** reuse `folio_accounts` with `account_type` extended to `'internal_team'` (Departments) and `'partner'` (Partners) alongside existing `standard`/`mso`/`shop`. Single table, conditional UI per type. Cadence Hub already works against the table → free for new types.
     - **Schema:** `agreement_end_date date`, `scope_summary text`, `billing_terms text`, `spend_ytd numeric` on `folio_accounts` (all nullable). `is_leader boolean default false`, `is_primary boolean default false` on `folio_contacts`.
     - **Nav:** Desktop → 3 flat top-level items (Accounts / Departments / Partners) with a divider between Accounts and Departments. Mobile → collapsible "Workspaces" group containing the three.
     - **Conditional UI:** Customer types show revenue/pipeline/tier/shop. Department/Partner hide all of those. Partner shows agreement-end / scope-summary / billing-terms / spend-YTD. All three show contacts, cadences, Cadence Hub, open items, notes scratchpad, Pip.
     - **Contacts:** New `Leader` (☆) and `Primary` (📌) toggles per contact. Leaders sort to top with marker. Primary gets a pin badge. Same contact can be both. Especially useful on Departments — surfaces team leads and day-to-day contact.
     - **List views:** Reuse `AccountsView` with a `typeFilter` prop instead of three separate files. `/departments` and `/partners` routes filter that view.
     - **Pip context branching:** customer → revenue/pipeline/days-since-contact; department → cross-team deliverables and overdue commitments; partner → renewal/scope/spend.
     - **Permissions:** Same org RLS as accounts (everyone in org sees all). Scoped visibility (HR-only sees HR) deferred.
     - **Add modal:** AddAccountModal type dropdown includes `internal_team` and `partner` with friendly labels. The Add CTA copy adapts to context (`+ Department` on /departments, `+ Partner` on /partners, `+ Account` on /accounts).
     - **Org chart view for contacts:** queued as follow-up (not v1).
   - **Inactive / archive + account merge (locked spec):** No hard deletes for accounts or users — always reversible. Acquisitions get a merge path.
     - **Schema (accounts):** add `is_inactive boolean default false`, `inactivated_at timestamptz`, `merged_into_account_id uuid references folio_accounts(id)` to `folio_accounts`.
     - **Schema (users):** add `is_inactive boolean default false`, `inactivated_at timestamptz` to `folio_org_members`. Inactive users can't be assigned new work; historical records stay.
     - **Inactive list behavior:** inactive cards stay visible in the workspace list (greyed out, lower opacity, `INACTIVE` mono pill). Filter toggle in the list header — "Hide inactive" — flips the default. State persisted in localStorage per workspace.
     - **Detail page:** inactive accounts are still **editable** (you might log a check-in or update notes about why they left). Header shows a yellow `Inactive` pill and the "Delete" action is replaced by a "Reactivate" button. Merged-into accounts also show "Merged into [Acme Corp]" with a link back to the survivor.
     - **Global search / Pip / command palette:** still finds inactive accounts but tags them visually so they don't get confused with active ones. Pip insight cards exclude inactive accounts from "needs attention" counts.
     - **Merge flow:** From the *source* account (the one being absorbed), tap "Merge into…" in the row actions → pick target from a dropdown → confirm. After merge: all child rows (meetings, items, contacts, cadences, projects, account_notes, activity, pip_account_state) re-parent from source → target. Source is marked inactive with `merged_into_account_id = target.id`. No dedupe attempt — both accounts' duplicates carry over; user cleans up manually.
     - **Auth user deletion path:** moot once inactive flag ships. Inactive users keep their auth row but `is_inactive=true` blocks sign-in (enforced in `useAuth.js`).
   - *(shipped — see Already shipped)*

4. **Native feel:** *(no open items)*

5. **Overview tab redesign + account intelligence:** *(no open items)*

6. **Motion design / transitions:** *(no open items)*

7. **Typography & visual rhythm:** *(no open items)*

8. **Copy & tone:** *(no open items)*

9. **Search & discoverability:**
   - Extend global search to contacts (names, emails, titles) — currently covers accounts only
   - Pipeline filters — tier, status, revenue range chips on PipelineView

10. **Onboarding & contextual help:** *(no open items)*

11. **Export & sharing:** *(no open items)*

12. **Personalization:** *(no open items)*

13. **Data visualization:** *(no open items)*

14. **Gauge + account change log:** *(no open items)*

15. *(shipped — see Already shipped)*

16. **Route Builder:** *(no open items)*

17. *(shipped — see Already shipped)*

**Already shipped (drop from list):**
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
- ✅ Pipeline V2 + Revenue History + Shop Metrics — Log Month modal, MoM/YoY deltas, sparklines, shop metrics dots on pipeline cards
- ✅ Data Visualization — 8-point sparklines + MoM trend arrows on account cards; 6-month meeting frequency bars on account detail header
- ✅ Gauge + Account Change Log — deliveries in Brief Me, active projects fed into Pip context, Recent Deliveries on Overview (already shipped)
- ✅ Route Builder — TSP optimizer, Nominatim geocoding, schedule sidebar with arrival times and drive estimates, Google Maps handoff, save routes to DB
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
