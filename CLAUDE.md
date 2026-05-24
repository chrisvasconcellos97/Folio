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

2. **Code quality — one remaining fix:**
   - **Split oversized files** — CadenceView.jsx (573 lines), AccountsView.jsx (598 lines), and OverviewTab.jsx (535 lines) each mix 3–5 sub-components inline. Extract CalendarView, WeekView, and ListView out of CadenceView as a starting point.

3. **Feature completeness:** *(no open items)*

4. **Native feel:** *(no open items)*

5. **Overview tab redesign + account intelligence:** *(no open items)*

6. **Motion design / transitions:** *(no open items)*

7. **Typography & visual rhythm:** *(no open items)*

8. **Copy & tone:** *(no open items)*

9. **Search & discoverability:** *(no open items)*

10. **Onboarding & contextual help:** *(no open items)*

11. **Export & sharing:**
    - **PDF account sheet** — one-tap export of an account's overview: name, status, contacts, last meeting summary, open items, active projects.
    - **Export contacts to CSV** — download all contacts for an account.
    - **Share meeting summary** — copy-ready text block from a meeting's notes + action items.

12. **Personalization:** *(no open items)*

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
