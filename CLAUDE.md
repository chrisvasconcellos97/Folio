# Folio — Claude Development Context

## Deployment Rule
**Vercel production branch is `claude/build-folio-desktop-app-XzvZ5`.** Always push to both `main` AND this branch on every commit:
```
git push origin HEAD:main
git push origin HEAD:claude/build-folio-desktop-app-XzvZ5
```
**Do NOT push to any other branches** — every branch push counts toward Vercel's deployment limit. Now on Pro plan so limit is much higher, but still avoid unnecessary branch pushes.

## Patch — Background Build Agent

**Patch** is the name for the background agent used to execute large batch builds. When a batch of queued items is ready to ship, spawn Patch via the Agent tool with `isolation: "worktree"` so it works in a clean copy of the repo without disrupting the main conversation.

- Patch handles the building, Claude handles the thinking
- Use Patch for multi-file batches (5+ files) to keep the main context clean
- Patch commits and pushes to `main` when done — one clean commit per batch
- The stop hook has a 10-minute grace period so Patch can work without triggering mid-batch commits

## The Briefcase Suite

Briefcase is a suite of three apps built around account management, conference work, and project tracking. Folio is the hub — Lanyard and Gauge are spokes that punch out from Folio and feed data back.

- **Folio** (`chrisvasconcellos97/Folio`) — year-round account management. Accounts, meetings, pipeline, contacts, open items, Pip AI. The hub.
- **Lanyard** (separate repo) — conference-specific app. Schedule, partner profiles, team chat, personal meeting notes, Pip AI. Punches out from Folio during conferences, feeds notes and partner data back.
- **Gauge** (not yet built) — project management. Tracks commitments and deliverables from account meetings (Phase 1), then expands to company-wide product team integration where PMs manage work and AMs are linked to relevant projects (Phase 2). Feeds project status back into Folio account views.

All three apps share the **same Supabase project**: `https://yrpdjmyfidhxlpmxasao.supabase.co`

### Gauge — Build Notes
- Phase 1: AM-facing. Commitments from meetings graduate into tracked projects in Gauge, visible on the account in Folio.
- Phase 2: Company-wide. Product team uses Gauge as their primary tool, AMs linked to relevant projects. Get input from OEC product team and PMs before building Phase 2 — they'll know what's missing.
- Same security model as Folio and Lanyard — shared Supabase, RLS, 2FA inherited automatically.

---

## Folio — Current State

- React + Vite, deployed on Vercel, live as of May 2026
- Supabase Auth (real email/password accounts)
- Tables: `folio_accounts`, `folio_contacts`, `folio_meetings`, `folio_items` — all with RLS tied to `auth.uid()`
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

## Folio ↔ Lanyard Integration — Current Status

- Lanyard ABPA 2026 partner data and meeting notes have been imported into Folio
- Going forward, Lanyard will need real auth before bidirectional sync makes sense

---

## Pip

Both apps use the same Pip personality — a loyal, slightly anxious field analyst. Pip has access to account/meeting context injected into the system prompt. Model: `claude-haiku-4-5-20251001`.

### Pip cost strategy
- Generate Pip outputs once, save to DB (`pip_summary`, `pip_email` columns)
- Never regenerate what's already saved — load from DB instead
- Future "Ask Pip" button should check for existing output before making an API call

---

## Supabase

- Project URL: `https://yrpdjmyfidhxlpmxasao.supabase.co`
- Same project for both Folio and Lanyard
- Folio tables have proper RLS via `auth.uid()`
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

---

## Pending Updates

1. **Pipeline V2 + Revenue History + Shop Metrics** — one batch build, three connected pieces:
   - **`folio_revenue_history`** table: `id, user_id, account_id, month int, year int, revenue numeric, created_at`. Unique on `(account_id, month, year)`. Monthly snapshots, upserted manually when Chris runs reports.
   - **`folio_shop_metrics`** table: `id, user_id, account_id, month int, year int, connected int, integrated int, no_connection int, created_at`. Same pattern. Tracks shop connection status counts per supplier account per month.
   - **Pipeline view redesign** — replaces current revenue bar view. Shows all accounts with MoM/YoY revenue deltas. Desktop: Recharts bar/line chart (12-month view). Mobile: table with MoM/YoY columns. "Log Month" entry mode for bulk monthly input.
   - **Account detail** — new section showing that account's revenue history sparkline + MoM/YoY, and shop metrics counts with MoM deltas (Connected ↑2 / Integrated ↑4 / No Connection ↓1). Only shown if data exists for that account.
   - **Pip context** — revenue trend and shop metrics fed into Pip system prompt per account for richer pre-call briefs.
   - **Data entry workflow** — Chris runs monthly reports externally, pastes numbers into chat, Claude upserts rows directly via Supabase. No complex input UI needed for now.

2. **Code quality — two remaining fixes:**
   - **Consolidate rgba opacity scale** — 78 hardcoded `rgba(74,155,130,0.*)` values still in source files. Tokens exist in `src/lib/colors.js` (`C.accentGlow`, `C.accentFaint`, `C.accentLine`, etc.) but components still use raw strings. Replace all with C tokens.
   - **Split oversized files** — CadenceView.jsx (573 lines), AccountsView.jsx (598 lines), and OverviewTab.jsx (535 lines) each mix 3–5 sub-components inline. Extract CalendarView, WeekView, and ListView out of CadenceView as a starting point.

3. **Feature completeness:**
   - **Cadence carry-forward not implemented** — items are independent records with no link to cadence occurrences. No trigger or logic auto-creates an item when a recurring task cadence fires. Either build a scheduled function or add a manual "create item from cadence" button as a stopgap.

4. **Native feel / micro-polish:**
   - **Prevent overscroll bounce** — add `overscroll-behavior: none` to content scroll containers so iOS rubber-band doesn't expose the dark background behind the app.
   - **Reset scroll on view change** — when navigating between views, scroll position stays wherever it was left. Reset to top on view change.
   - **Remove tap highlight** — add `-webkit-tap-highlight-color: transparent` globally so tapping buttons/cards doesn't flash the default blue iOS highlight.
   - **Active/pressed states** — interactive cards and nav buttons have no visual press feedback. Add subtle `opacity: 0.75` or `transform: scale(0.97)` on `:active`.
   - **Safe area insets** — on iPhone with notch/home bar, content can be obscured. Apply `padding-bottom: env(safe-area-inset-bottom)` to the bottom nav and `padding-top: env(safe-area-inset-top)` to the header.
   - **Input font-size 16px minimum** — any `<input>` with `font-size < 16px` triggers iOS auto-zoom on focus. Audit all inputs and enforce `font-size: 16px` minimum.
   - **No text selection on UI chrome** — account names, labels, nav items, and buttons highlight on long-press/drag. Add `user-select: none` to nav, headers, and card chrome; leave it on actual content (notes, emails).
   - **Cursor consistency** — some interactive divs (chip dropdowns, calendar cells, account cards) are missing `cursor: pointer`. Audit and standardize.

5. **Overview tab redesign + account intelligence:**
   - **Account health auto-score** — calculated indicator (green/yellow/red) based on days since last contact, open items age, cadence compliance, and revenue trend. Replaces the manually-set status as the primary health signal, or sits alongside it.
   - **Quick notes scratchpad** — a free-form text area on the Overview tab for thoughts that don't belong to a specific meeting. Fast capture, auto-saves.
   - **Follow-up due date on Overview** — surface the follow-up date from the last meeting prominently on Overview with a visual indicator if it's overdue. Badge on the account card in the list if follow-up is past due.
   - **"Brief me" Pip modal** — a button on the account detail header that opens a clean Pip-powered pre-call brief: last meeting summary, open items, contacts you're seeing, follow-up from last time. Designed to be read in a parking lot before walking in.
   - **Click-to-call** — wrap contact phone numbers in `tel:` links so tapping on mobile dials directly. One-line change per contact card.
   - **Multi-select email contacts** — checkboxes on the Contacts tab, "Email selected" button that builds `mailto:email1,email2` opening Outlook with all selected contacts in To. Option to pre-populate with Pip's draft email.

6. **Motion design / transitions:**
   - **Slide direction** — navigation should feel spatial: going "forward" slides content in from the right; going "back" slides from the left. Track nav direction in state and apply `slideInRight` vs `slideInLeft` keyframes instead of the generic fade.
   - **Mobile sheet modals** — on mobile breakpoint, modals should slide up from the bottom like a native iOS sheet. One CSS change to `src/components/Modal.jsx` conditioned on viewport width.
   - **Staggered list load** — account cards, meeting rows, and contact entries animate in one-by-one with a 50ms CSS `animation-delay` between each item when a view loads.
   - **Directional back transition** — navigating back from account detail fades + slides right (reverse of forward). Requires the slide direction tracking above.

7. **Typography & visual rhythm:**
    - **Consistent type scale** — standardize to 12 / 14 / 16 / 20 / 24px across the app. Currently uses 9, 11, 12, 13, 15, 22, 24px with no clear system.
    - **Tabular nums on all figures** — revenue, counts, and dates should use `font-variant-numeric: tabular-nums`. Already on the revenue header; needs to be everywhere.
    - **Consistent label spacing** — uppercase tracking labels (`font-size: 9px`, `letter-spacing: 0.08em`) are used inconsistently. Define one standard and apply it everywhere.
    - **Line height audit** — dense info cards (account cards, meeting rows) have inconsistent line heights.

8. **Copy & tone:**
    - **Empty states** — replace flat "No accounts", "No meetings", "No contacts yet" with copy that sounds like Pip is waiting. Sets the personality from the first moment and tells the user what to do next.
    - **Button labels** — "Save" → "Got it", confirms should feel deliberate not clinical.
    - **Error messages** — Supabase errors and network failures currently surface as raw or generic text. Rewrite to be human and actionable: "Couldn't save — check your connection" instead of "Error 500".
    - **Section headers** — labels like "YTD Revenue", "Open Items", "Last Interaction" are functional but terse. Light copy polish makes the app feel more considered.

9. **Search & discoverability:**
    - **Global search** — extend search beyond account names to hit contacts, meeting notes, open items, and tags.
    - **Desktop command palette** — ⌘K opens a quick-jump overlay to navigate anywhere: accounts, views, modals.
    - **Search history** — remember the last 5 searches in localStorage.

10. **Onboarding & contextual help:**
    - **First-run empty states** — when a new user has no accounts/meetings/contacts, guide them through adding their first one. Smarter empty states with a clear CTA and one-line explanation.
    - **Contextual tooltips** — less obvious features (cadence, Pip, Gauge tab) get a one-time tooltip on first encounter. Dismissed on tap, stored in localStorage.
    - **New user checklist** — add your first account, log a meeting, set a cadence. Disappears once all three are done.

11. **Export & sharing:**
    - **PDF account sheet** — one-tap export of an account's overview: name, status, contacts, last meeting summary, open items, active projects.
    - **Export contacts to CSV** — download all contacts for an account.
    - **Share meeting summary** — copy-ready text block from a meeting's notes + action items.

12. **Personalization:**
    - **Persistent sort and filter preferences** — remember preferred account sort order, active filters, and cadence calendar view. Stored in localStorage per user.
    - **Default tab per account** — let users pin a default tab so opening an account always lands on Meetings, Contacts, or Overview.
    - **Dashboard density toggle** — compact vs. comfortable view on the accounts list.

13. **Data visualization:**
    - **Sparklines on account cards** — a tiny 8-point revenue trend line on each account card. Only shown if revenue history data exists.
    - **Health score indicator** — a green/yellow/red dot with a trend arrow (↑↓→) on the account card and detail header. Derived from the auto-score logic in item 5.
    - **Meeting frequency bars** — a small bar chart on the account detail header showing meeting cadence over the last 6 months.
    - **Pipeline event markers** — completed Gauge projects overlaid as markers on the revenue trend chart in Pipeline view.

14. **Gauge + account change log:**
    - **Account change log** — every completed Gauge task or project creates a dated entry on the account: what was done, when. Not a task list — a delivery record.
    - **Surface in Overview** — "Recent Deliveries" section on the account Overview tab showing the last 3–5 completed items with dates.
    - **Surface in "Brief me"** — pre-call brief includes what was delivered since the last meeting.
    - **Surface in Pip context** — feed active project statuses and recent completions into Pip's system prompt.

15. **Gauge — full build (multi-user, custom columns, request workflow):**
    - **Core columns (hardcoded)** — Priority, Date of Request (auto), Owner/Assigned To, Linked Folio Account, Status, Due Date, Notes.
    - **Custom columns** — user-defined fields per project type. Types: Text, Number, Date, Dropdown, Checkbox, URL. Stored in `project_fields` + `task_field_values` tables — no DB migrations when a column is added. For Trax: # of Shops, Connection Macro Date, Integration Macro Date, Email Thread, Initiative.
    - **Task stages** — sequential stages with individual completion dates (e.g. Connection → Integration → Complete).
    - **Continuous project type** — open-ended project with no fixed end date. Tasks trickle in over time (e.g. LKQ integrations).
    - **Request submission from Folio** — "New Request" button on the Gauge tab within an account detail. Pre-fills the linked account.
    - **Coworker queue view** — a personal task list across all accounts showing everything assigned to that user, sorted by priority and due date.
    - **Multi-user access** — coworker needs a login. Org/team layer required — design data model with `org_id` and `assigned_to` from day one.
    - **Completion feeds change log** — completing a task automatically creates a dated entry on the linked Folio account's change log (item 14 above).

16. **Route Builder — territory routing for MSO field visits:**

    **Primary users:** MSO team. They visit 5 shops/day on average, routes can be single-day or multi-day, starting point is flexible (home, office, or first stop).

    **Technical approach (fully decided, no open questions):**
    - **Map**: Leaflet + OpenStreetMap — free, no API key, ~200kb bundle add. Renders numbered pins and a polyline connecting the route in optimized order.
    - **Geocoding**: Nominatim (OpenStreetMap geocoder) — free, no API key, rate-limited to 1 req/sec (fine for personal use). Address → lat/lng, cached on the account record. Never re-geocode a cached address.
    - **Route optimization**: Brute-force TSP in pure JS. For ≤10 stops: try all N! orderings, keep shortest total Haversine distance. For >10 stops: nearest-neighbor greedy. No API needed.
    - **Navigation handoff**: "Open in Google Maps" button builds a `maps.google.com/dir/` URL with all waypoints in optimized order. Apple Maps fallback for iOS.
    - **No external routing API needed** — drive times are estimated from Haversine distance ÷ average speed (45mph). Good enough for schedule planning; actual navigation uses Google Maps.

    **Feature shape:**
    - New "Route" nav item (or accessible from accounts list via multi-select)
    - Account selector: pick shops manually, or use "Load from MSO" to pull all shops under an MSO account
    - Enter starting point (text address or "use my location")
    - App geocodes un-geocoded shops, then runs optimizer
    - **Map view**: Leaflet map with numbered pins (1→N) and a polyline tracing the route
    - **Schedule sidebar**: set start time + visit duration per stop (default 45 min). Auto-fills the day: "Depart 9:00am → Shop A (9:20 arrive, 45 min visit) → Depart 10:05 → Shop B (10:35 arrive)..."
    - **Multi-day**: Day 1 / Day 2 / Day 3 tabs. Drag stops between days. Each day gets its own map and schedule.
    - **"Open in Maps"** button per day, hands off the full day's route to Google/Apple Maps
    - Saved routes: store route as a `folio_routes` record (name, stop order, date) so you can re-use a regular weekly territory run

    **DB additions needed:**
    - `folio_routes`: `id, user_id, name, date, stops jsonb (ordered array of account_ids + visit_duration), created_at`

    **Build order:**
    1. DB migration: folio_routes table (address/lat/lng/account_type/account_number already live)
    2. Geocode-on-save in AddAccountModal (Nominatim, cache result in lat/lng)
    3. Route Builder view: account selector + optimizer + schedule sidebar
    4. Leaflet map layer (can ship 3 without 4 and it's still fully functional)

**Already shipped (drop from list):**
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

### High priority
- [ ] **"Ask Pip" button on meetings** — generates summary, cleaned notes, draft email on demand; saves result to `pip_summary` / `pip_email` so it's never regenerated
- [ ] **Pip context improvement** — pass full account history (all meetings, open items, contacts) into Pip system prompt for richer responses
- [ ] **Revenue field formatting** — currently free text, should be a number field with proper formatting and sorting
- [ ] **Last meeting auto-update** — when a meeting is logged, auto-set `last_meeting` on the account

### Medium priority
- [ ] **Business card scanner** — "Scan Card" button in Add Contact opens camera, sends image to Claude vision via new `api/scan-card.js`, auto-fills name/title/phone/email/linkedin. Smart account matching: fuzzy-match extracted company name against existing `folio_accounts` — if match found, show "Looks like [Account Name] — add to this account?" with one-tap confirm; if no match, prompt to create a new account. Ideal for post-conference intake.
- [ ] **Email integration** — one-tap to open draft follow-up email in mail client (`mailto:` link pre-populated)
- [ ] **Open items on meetings** — when logging a meeting, action items should optionally auto-create open items
- [ ] **Account search improvement** — search across contacts and notes, not just account name
- [ ] **Pipeline filters** — filter by tier, status, revenue range
- [ ] **Notifications / reminders** — flag accounts with no contact in X days, overdue items

### Cadence (once built)
- [ ] **Cadence analytics** — meeting frequency per account, open item age, account health trends over time, Pip flags accounts untouched in 30+ days. Hold until enough data exists to make it meaningful.
- [ ] **Power BI integration** — connect Supabase directly to Power BI via Postgres connection string for full dashboard reporting. No special integration needed, just expose the DB connection. Hold until data volume justifies it.

### Briefcase Landing Page
- [ ] **Separate repo: `chrisvasconcellos97/Briefcase`** — standalone marketing/intro page for the full suite. Interactive icon selector to preview each app, live link to Folio, suite overview. Pitch line: "From the conference floor to year-round relationships. One suite. Powered by Pip." Reference image saved in Chris's previous Claude chat showing the three-app layout with Folio center, Lanyard left, Gauge right, SYNC connectors between them.

### Future / bigger features
- [ ] **Director view** — a read-only leadership layer built on the same Supabase data. High-level portfolio health across all accounts: which accounts are going cold, open item counts by account, revenue trend summaries, cadence compliance. A director doesn't log meetings or set cadences — they just need the pulse. Same data, different lens. Requires team/org support first so accounts can be scoped to a rep.
- [ ] **Team support** — org layer, multiple users per account, shared accounts
- [ ] **Lanyard real auth** — connect Lanyard users to Folio users via Supabase Auth
- [ ] **Lanyard → Folio live sync** — post-conference notes flow into Folio automatically once auth is shared
- [ ] **CRM integrations** — Salesforce / HubSpot sync
- [ ] **Mobile app** — React Native wrapper or PWA improvements

---

## Open TODOs

- [ ] Add real Supabase Auth to Lanyard
- [ ] Run `notifications` and `messages` SQL in Supabase to activate Lanyard features
- [ ] Connect Folio and Lanyard bidirectionally once Lanyard has real auth
