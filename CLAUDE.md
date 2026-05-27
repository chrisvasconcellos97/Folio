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
2. **Explicit registration in `src/main.jsx`** — uses `virtual:pwa-register` with `immediate: true`. On `onNeedRefresh`, **auto-reloads silently** after a 600ms delay with a brief "Updating Folios…" toast — no manual button. Folios autosaves notes / drafts / items, so silent reload is safe. Also checks for updates every 10 min and on every tab visibility change. Never remove this registration; never re-add a manual refresh button without explicit reason.
3. **Vercel headers in `vercel.json`** — `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` all served with `Cache-Control: public, max-age=0, must-revalidate`. Hashed assets stay long-cached.
4. **Never gate critical features on cache state.** If the new build needs a fresh shell, the user gets the toast prompt — they never get a broken-looking app.
5. **Before any deploy that changes the SW or the shell — verify `vite.config.js` workbox block + main.jsx `registerSW` block are intact.** If a Patch build touches these files, double-check before merging.

Symptoms of SW staleness: app won't load, blank page, old UI showing despite recent deploy. Fix-in-the-moment: DevTools → Application → Service Workers → Unregister, then hard reload. But the system should prevent this from being needed.

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
- ✅ Pipeline V2 + Revenue History + Shop Metrics — Log Month modal, MoM/YoY deltas, sparklines, shop metrics dots on pipeline cards
- ✅ Data Visualization — 8-point sparklines + MoM trend arrows on account cards; 6-month meeting frequency bars on account detail header
- ✅ Gauge + Account Change Log — deliveries in Brief Me, active projects fed into Pip context, Recent Deliveries on Overview (already shipped)
- ✅ Route Builder — TSP optimizer, Nominatim geocoding, schedule sidebar with arrival times and drive estimates, Google Maps handoff, save routes to DB
- ✅ Team/Org Layer + Leadership View — `folio_orgs`, `folio_org_members`, `folio_account_notes`, `folio_activity` tables + migration SQL (`supabase/team_org_layer.sql`). `useOrg` hook, `useAccountNotes` hook (migrates from `account.objective`), fire-and-forget `logActivity` in all write hooks. Settings view with create-team + invite/revoke UI. Leadership view (full-width read-only portfolio dashboard). Invite banner on login. Role-aware rendering: leadership gets LeadershipView; everyone else gets normal app. "Team" nav item on desktop sidebar. "Team & Org" in UserMenu (mobile).
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
- [ ] **Lanyard real auth** — connect Lanyard users to Folios users via Supabase Auth
- [ ] **Lanyard → Folios live sync** — post-conference notes flow into Folios automatically once auth is shared
- [ ] **CRM integrations** — Salesforce / HubSpot sync
- [ ] **Mobile app** — React Native wrapper or PWA improvements

---

## Open TODOs

- [ ] Add real Supabase Auth to Lanyard
- [ ] Run `notifications` and `messages` SQL in Supabase to activate Lanyard features
- [ ] Connect Folios and Lanyard bidirectionally once Lanyard has real auth
