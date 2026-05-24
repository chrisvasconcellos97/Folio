# Folio — Claude Development Context

## Deployment Rule
**Push to `main` only.** Vercel deploys automatically from `main`. Do NOT push to any other branches — every branch push counts toward Vercel's 100 deployments/day free tier limit.
```
git push origin HEAD:main
```

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
- **Before shipping items 11–14:** do a full layout audit first — review placement, spacing, and information hierarchy across every screen to make sure new features land cleanly into a well-organized foundation

---

## Pending Updates

1. **Pip cards — PipelineView + MeetingsView** — two views still using hand-rolled `PipMark` cards instead of `PipInsightCard` with `pickV` rotating variants. PipelineView has a `pipAnalysis()` function with real logic but needs the standard card treatment. MeetingsView has no top-level insight card at all — needs one added that reads meeting volume, recency, upcoming count, and account coverage.

2. **Pip Voice Chat** — microphone button next to the send arrow in Pip's input bar. Tap to start listening (browser Web Speech API, free, no backend changes). Silence detection auto-sends. Pip's text response is also read aloud via browser SpeechSynthesis. Small speaker toggle to mute audio output. Mic button pulses while recording. Works hands-free — useful while driving between accounts. Start with free browser APIs; swap in ElevenLabs/Whisper later if voice quality needs improvement.

2. **Pipeline V2 + Revenue History + Shop Metrics** — one batch build, three connected pieces:
   - **`folio_revenue_history`** table: `id, user_id, account_id, month int, year int, revenue numeric, created_at`. Unique on `(account_id, month, year)`. Monthly snapshots, upserted manually when Chris runs reports.
   - **`folio_shop_metrics`** table: `id, user_id, account_id, month int, year int, connected int, integrated int, no_connection int, created_at`. Same pattern. Tracks shop connection status counts per supplier account per month.
   - **Pipeline view redesign** — replaces current revenue bar view. Shows all accounts with MoM/YoY revenue deltas. Desktop: Recharts bar/line chart (12-month view). Mobile: table with MoM/YoY columns. "Log Month" entry mode for bulk monthly input.
   - **Account detail** — new section showing that account's revenue history sparkline + MoM/YoY, and shop metrics counts with MoM deltas (Connected ↑2 / Integrated ↑4 / No Connection ↓1). Only shown if data exists for that account.
   - **Pip context** — revenue trend and shop metrics fed into Pip system prompt per account for richer pre-call briefs.
   - **Data entry workflow** — Chris runs monthly reports externally, pastes numbers into chat, Claude upserts rows directly via Supabase. No complex input UI needed for now.

3. **Performance — three targeted fixes:**
   - **`useMemo` in AccountsView** — wrap the 6 chained filter/sort computations (availableTags, availableRegions, filtered, displayList, etc. — lines ~50–109) in `useMemo` keyed on their actual inputs. Prevents re-running on every keystroke in the search field.
   - **Memoize insight builders** — all `buildXInsight()` calls (`buildPipInsight`, `buildMeetingsInsight`, `buildPipelineInsight`, `buildGlobalCadenceInsight`) run on every parent render. Wrap in `useMemo`; since the seed is date-based the result is stable per day. Prevents text flickering when unrelated state changes.
   - **Fix index-based list keys in CadenceView** — lines 228, 260, 323 use loop index `j`/`i` as React keys. Replace with `ev.id` or a stable string to prevent incorrect remounts on reorder.

4. **UX polish — seven fixes:**
   - **Toast notifications** — build a lightweight shared `Toast` component (~50 lines, no library). 2-second fade, top-center position. Wire into all CRUD operations: saves, deletes, errors. Single `useToast` hook or context so any component can trigger it.
   - **Consistent delete confirmation** — standardize the "Sure?" two-step pattern (already exists in CadenceTab and AccountDetail) across MeetingsTab, ContactsTab, and QuickTaskModal. All three currently fire delete on a single click.
   - **Escape key closes modals** — add a `useEffect` in `src/components/Modal.jsx` that listens for `keydown` Escape and calls `onClose`. One change, fixes every modal in the app.
   - **Actionable empty states** — add a CTA button to each empty state that has one: AccountsView "No accounts" → "Add Account", ItemsTab "All clear" → "Add Action Item", MeetingsView → "Log a Meeting" (navigates to account), ContactsTab "No contacts yet" → "Add Contact".
   - **Mobile tap targets** — ItemsTab checkbox squares are 16px (too small for thumb); Modal close `×` has no padding. Wrap checkbox in a larger hit area div; add padding to modal close button.
   - **QuickTaskModal "Saving…" state** — `saving` state exists but button text never changes. Update button label to "Saving…" while in-flight.
   - **Pip auto-scroll to latest** — when a new Pip message arrives, auto-scroll the conversation container to the bottom. `useRef` on the message list + `scrollIntoView` on message append.

5. **Accessibility (a11y):**
   - **aria-labels on icon-only buttons** — Modal close `×`, calendar nav `‹` `›`, Pip send `→`, mic and mute buttons all lack aria-label. Screen readers can't describe them. One-line fix per button.
   - **Interactive divs need button semantics** — ItemsTab checkboxes, CadenceView calendar day cells, account list cards, and week-view event divs are all `<div onClick>` with no `role="button"` or `tabIndex`. Keyboard users can't reach them. Convert to `<button>` or add role + tabIndex + onKeyDown.
   - **Semantic form labels** — the `FL` (FieldLabel) component is a styled div, not a `<label>`. No input has an `id` or `aria-labelledby` linking it to its label. Screen readers announce inputs with no context. Convert FL to render a `<label>` and add matching `id` props to InputField.
   - **Focus trap in Modal** — when a modal opens, focus isn't moved inside and Tab can still reach background elements. Add focus trap to `src/components/Modal.jsx` (move focus on open, return to trigger on close).
   - **aria-live for dynamic content** — Pip responses, task completions, and form errors appear dynamically with no `aria-live` announcement. Screen reader users miss them. Add `aria-live="polite"` to the Pip message list and error containers.

6. **Code quality:**
   - **Extract `ChipDropdown` component** — the trigger-button + backdrop + floating chip panel pattern is copy-pasted identically in SetCadenceModal, QuickTaskModal, and AddAccountModal (~150 lines duplicated across 3 files). Extract to `src/components/ChipDropdown.jsx` with props for `options`, `value`/`values`, `onSelect`, `multi`, `placeholder`. One fix propagates everywhere.
   - **Add missing color tokens to `C`** — `#1a2b28` (dropdown panel background) is hardcoded in at least 5 places. Add `C.bgDropdown = "#1a2b28"` to `src/lib/colors.js`. Also consolidate the `rgba(74,155,130,0.*)` opacity variants — they're used at 6, 7, 12, 15, 18, 3, 35, 4, 45 inconsistently. Define a standard scale.
   - **Split oversized files** — CadenceView.jsx (571 lines), AccountsView.jsx (553 lines), and OverviewTab.jsx (531 lines) each mix 3–5 sub-components and their logic inline. Extract CalendarView, WeekView, and ListView out of CadenceView as a starting point.

7. **Error resilience:**
   - **Surface fetch errors from all hooks** — useMeetings, useItems, useContacts, useCadences, useProjects, and useAccountMetrics all swallow Supabase errors silently (stale data with no indication). Only useAccounts has an error state. Add `error` state to all hooks and show a banner or retry button when data fails to load.
   - **Pip API timeout + retry** — `src/lib/pip.js` has no AbortController, so a stalled request hangs indefinitely. Add a 25-second timeout and one automatic retry on 5xx. Handle 429 (rate limit) responses specifically with a user-facing "Pip is busy, try again in a moment" message.
   - **Fix fire-and-forget metadata updates** — `last_meeting` and `last_interaction_at` updates in useMeetings, useItems, and useContacts use `.then()` with no callback and no `.catch()`. Failures are completely silent. Add error logging at minimum; ideally surface a non-blocking warning.

8. **Feature completeness:**
   - **⚠️ DATA LOSS — Add `attendees` column to meetings table** — LogMeetingModal saves `attendees` array, MeetingsTab and CadenceTab render it, but `folio_meetings` has no `attendees` column in the schema. Every meeting's attendee list is silently dropped on save. Fix: `ALTER TABLE folio_meetings ADD COLUMN IF NOT EXISTS attendees text[];`
   - **Edit Meeting modal** — meetings can be created and deleted but not edited. `updateMeeting` exists in the hook and is passed to MeetingsTab but there's no modal wired to it. 9 fields (title, date, notes, talking_points, attendees, action_items, commitments, follow_up_date, rating) are frozen after creation.
   - **Edit Item modal** — items can be created and closed but not edited. `updateItem` exists in the hook but AddItemModal has no edit mode and the hook function isn't even exported to AccountDetail. Text, due_date, and owner can't be changed without delete + recreate.
   - **Edit Contact modal** — contacts can be created and deleted but not edited. `updateContact` doesn't exist in the hook at all. Name, title, phone, email, linkedin, notes all frozen after creation.
   - **pip_email mailto link** — pip_email is displayed with a Copy button in MeetingsTab but no `mailto:` link. ContactsTab already uses `href={"mailto:" + c.email}` — apply the same pattern to pip_email drafts so one tap opens the mail client.
   - **Cadence carry-forward not implemented** — CLAUDE.md marks it shipped but it isn't. Items are independent records with no link to cadence occurrences. No trigger or logic auto-creates an item when a recurring task cadence fires. Either build a scheduled function or add a manual "create item from cadence" button as a stopgap.
   - **Schema sync** — `supabase/contacts_v2.sql` adds phone/email/linkedin columns that are missing from the base `schema.sql`. Anyone running schema.sql fresh is missing those columns. Consolidate into schema.sql.

9. **PWA / installability:**
   - **Web manifest + icons** — no `manifest.json`, no app icons (192×192, 512×512), no `apple-touch-icon`. App cannot be installed to home screen. Add manifest via `vite-plugin-pwa` (already in the Vite ecosystem) with name, short_name, theme_color matching `C.bg` (#0D1F1C), and a PipMark-based icon.
   - **Offline account cache** — all data requires live Supabase. At minimum, cache the accounts list and most recent meetings in localStorage so the app is readable in a spotty-signal parking lot before a call. Write-through on fetch, read from cache if network fails.
   - **PWA meta tags** — add `<meta name="theme-color">` and `<meta name="apple-mobile-web-app-capable">` to `index.html` for correct iOS home screen behavior.

10. **Developer experience:**
    - **ESLint** — no config exists. Add `eslint` + `eslint-plugin-react` + `eslint-plugin-react-hooks` with a minimal config. The react-hooks rules would have caught several of the issues above (missing deps, components defined inside components). Add a `lint` script to package.json.
    - **GitHub Actions CI** — no `.github/workflows` exists. A single lint-on-push workflow (lint + build) would catch broken builds before they reach Vercel. Low setup cost, high safety net value.
    - **Vitest** — Vite projects get Vitest for free (same config, no Jest overhead). Not urgent, but worth adding when the codebase stabilizes — the utility functions in `src/lib/` (cadenceUtils, metricsUtils, regions) are pure functions that are easy to unit test.

11. **Native feel / micro-polish:**
    - **Prevent overscroll bounce** — add `overscroll-behavior: none` to content scroll containers so iOS rubber-band doesn't expose the dark background behind the app.
    - **Reset scroll on view change** — when navigating between views, scroll position stays wherever it was left. Reset to top on view change so you never land halfway down a new screen.
    - **Remove tap highlight** — add `-webkit-tap-highlight-color: transparent` globally so tapping buttons/cards doesn't flash the default blue iOS highlight.
    - **Active/pressed states** — interactive cards and nav buttons have no visual press feedback. Add subtle `opacity: 0.75` or `transform: scale(0.97)` on `:active` so every tap feels acknowledged.
    - **Safe area insets** — on iPhone with notch/home bar, content can be obscured. Apply `padding-bottom: env(safe-area-inset-bottom)` to the bottom nav and `padding-top: env(safe-area-inset-top)` to the header.
    - **Input font-size 16px minimum** — any `<input>` with `font-size < 16px` triggers iOS auto-zoom on focus, shifting the whole layout. Audit all inputs and enforce `font-size: 16px` minimum (can visually scale with `transform` if needed).
    - **No text selection on UI chrome** — account names, labels, nav items, and buttons all highlight on long-press/drag. Add `user-select: none` to nav, headers, and card chrome; leave it on actual content (notes, emails).
    - **Cursor consistency** — some interactive divs (chip dropdowns, calendar cells, account cards) are missing `cursor: pointer`. Audit and standardize.

13. **Overview tab redesign + account intelligence:**
    - **Account health auto-score** — calculated indicator (green/yellow/red) based on days since last contact, open items age, cadence compliance, and revenue trend. Replaces the manually-set status as the primary health signal, or sits alongside it.
    - **Quick notes scratchpad** — a free-form text area on the Overview tab for thoughts that don't belong to a specific meeting. "Heard they're switching suppliers." "CFO leaving in Q3." Fast capture, auto-saves.
    - **Follow-up due date on Overview** — surface the follow-up date from the last meeting prominently on Overview with a visual indicator if it's overdue. Badge on the account card in the list if follow-up is past due.
    - **"Brief me" Pip modal** — a button on the account detail header that opens a clean Pip-powered pre-call brief: last meeting summary, open items, contacts you're seeing, follow-up from last time. Designed to be read in a parking lot before walking in. Tap, read, close.
    - **Click-to-call** — wrap contact phone numbers in `tel:` links so tapping on mobile dials directly. One-line change per contact card.
    - **Multi-select email contacts** — checkboxes on the Contacts tab, "Email selected" button that builds `mailto:email1,email2` opening Outlook with all selected contacts in To. Option to pre-populate with Pip's draft email.

14. **Motion design / transitions:**
    - **Slide direction** — navigation should feel spatial: going "forward" (accounts → detail, list → tab) slides content in from the right; going "back" slides from the left. Track nav direction in state and apply `slideInRight` vs `slideInLeft` keyframes instead of the generic fade. Makes the app feel like real pages, not just swaps.
    - **Mobile sheet modals** — on mobile breakpoint, modals should slide up from the bottom like a native iOS sheet instead of appearing centered on screen. One CSS change to `src/components/Modal.jsx` conditioned on viewport width.
    - **Staggered list load** — account cards, meeting rows, and contact entries animate in one-by-one with a 50ms CSS `animation-delay` between each item when a view loads. Done with CSS `animation-delay` (not JS timers) so it's GPU-free and doesn't stutter.
    - **Directional back transition** — navigating back from account detail fades + slides right (reverse of forward). Requires knowing the transition direction, which the slide direction work above will already track.

15. **Typography & visual rhythm:**
    - **Consistent type scale** — standardize to 12 / 14 / 16 / 20 / 24px across the app. Currently uses 9, 11, 12, 13, 15, 22, 24px with no clear system. Makes every screen feel designed rather than assembled.
    - **Tabular nums on all figures** — revenue, counts, and dates should use `font-variant-numeric: tabular-nums` so numbers don't shift width when values change. Already on the revenue header; needs to be everywhere.
    - **Consistent label spacing** — uppercase tracking labels (`font-size: 9px`, `letter-spacing: 0.08em`) are used inconsistently. Define one standard and apply it everywhere section headers, field labels, and metadata appear.
    - **Line height audit** — dense info cards (account cards, meeting rows) have inconsistent line heights. Tighter on compact elements, more breathing room on primary content.

16. **Copy & tone:**
    - **Empty states** — replace flat "No accounts", "No meetings", "No contacts yet" with copy that sounds like Pip is waiting. Sets the personality from the first moment and tells the user what to do next.
    - **Button labels** — "Save" → "Got it", "Delete" → confirms should feel deliberate not clinical. Small words, big feel difference.
    - **Error messages** — Supabase errors and network failures currently surface as raw or generic text. Rewrite to be human and actionable: "Couldn't save — check your connection" instead of "Error 500".
    - **Section headers** — labels like "YTD Revenue", "Open Items", "Last Interaction" are functional but terse. Light copy polish makes the app feel more considered without adding clutter.

17. **Search & discoverability:**
    - **Global search** — extend search beyond account names to hit contacts, meeting notes, open items, and tags. Search "John" and see every John across all accounts. Search "integration" and surface every account with that word in any note.
    - **Desktop command palette** — ⌘K opens a quick-jump overlay to navigate anywhere: accounts, views, modals. Power user feature that makes desktop use significantly faster.
    - **Search history** — remember the last 5 searches so you can re-run them quickly. Stored in localStorage, no backend needed.

18. **Onboarding & contextual help:**
    - **First-run empty states** — when a new user has no accounts, no meetings, no contacts, the app should guide them through adding their first one. Not a wizard, just smarter empty states with a clear CTA and a one-line explanation of what belongs here.
    - **Contextual tooltips** — less obvious features (cadence, Pip, Gauge tab) get a one-time tooltip on first encounter. Dismissed on tap, never shown again. Stored in localStorage.
    - **New user checklist** — a lightweight "getting started" checklist: add your first account, log a meeting, set a cadence. Disappears once all three are done. Useful when handing the app to a new team member.

19. **Export & sharing:**
    - **PDF account sheet** — one-tap export of an account's overview: name, status, contacts, last meeting summary, open items, active projects. Useful before a quarterly review or manager check-in.
    - **Export contacts to CSV** — download all contacts for an account. Useful for mail merges, Outlook imports, or handing off to a colleague.
    - **Share meeting summary** — generate a shareable link or copy-ready text block from a meeting's notes + action items. No login required to view. Useful for sending a recap to someone who isn't in Folio.

20. **Personalization:**
    - **Persistent sort and filter preferences** — remember each user's preferred account sort order, active filters, and cadence calendar view (week vs. month). Stored in localStorage per user. No backend changes needed.
    - **Default tab per account** — let users pin a default tab so opening an account always lands on Meetings, or Contacts, or Overview, based on how they work.
    - **Dashboard density toggle** — compact vs. comfortable view on the accounts list. Compact shows more accounts per screen; comfortable shows more detail per card.

21. **Data visualization:**
    - **Sparklines on account cards** — a tiny 8-point revenue trend line on each account card. At a glance: is this account trending up or down? Only shown if revenue history data exists.
    - **Health score indicator** — a green/yellow/red dot with a trend arrow (↑↓→) on the account card and detail header. Derived from the auto-score logic in item 13. Makes portfolio health scannable without opening anything.
    - **Meeting frequency bars** — a small bar chart on the account detail header showing meeting cadence over the last 6 months. Instantly surfaces which accounts are getting attention and which are going cold.
    - **Pipeline event markers** — completed Gauge projects overlaid as markers on the revenue trend chart in Pipeline view. Correlate delivery dates with performance changes visually.

22. **Gauge + account change log:**
    - **Project statuses in Gauge** — Gauge projects should have a clear status: Planned / In Progress / Blocked / Complete / On Hold. Blocked is the most important to surface — it means something needs attention.
    - **Account change log** — every completed Gauge task or project creates a dated entry on the account: what was done, when. Not a task list — a delivery record. Feeds the update calendar concept so you can correlate work with performance changes.
    - **Surface in Overview** — "Recent Deliveries" section on the account Overview tab showing the last 3–5 completed items with dates. Always visible without opening Gauge.
    - **Surface in "Brief me"** — pre-call brief includes what was delivered since the last meeting. Walk in ready to say "since we last spoke, here's what we completed."
    - **Surface in Pip context** — feed active project statuses and recent completions into Pip's system prompt. "Two projects in progress, one blocked" changes the tone of a pre-call brief entirely.
    - **Multi-user Gauge** — coworkers should be able to use Gauge on shared accounts. Requires the org/team layer but the data model should be designed for it from the start so it's not a rewrite later.

23. **Gauge — full build (multi-user, custom columns, request workflow):**
    - **Core columns (hardcoded)** — Priority, Date of Request (auto), Owner/Assigned To, Linked Folio Account, Status, Due Date, Notes. Universal across every company.
    - **Custom columns** — user-defined fields per project type. Types: Text, Number, Date, Dropdown, Checkbox, URL. Stored in a `project_fields` table (schema) + `task_field_values` table (values) — no DB migrations when a column is added. For Trax: # of Shops, Connection Macro Date, Integration Macro Date, Email Thread, Initiative.
    - **Task stages** — tasks can have sequential stages with individual completion dates (e.g. Connection → Integration → Complete). Stage completion auto-logs the date.
    - **Continuous project type** — open-ended project with no fixed end date. Tasks trickle in over time (e.g. LKQ integrations). Not a cadence (no schedule) — just an ongoing queue. Tasks added as requests come in.
    - **Request submission from Folio** — "New Request" button on the Gauge tab within an account detail. Pre-fills the linked account. Lands in the assigned coworker's queue.
    - **Coworker queue view** — a personal task list across all accounts showing everything assigned to that user, sorted by priority and due date. The primary view for the admin/executor role.
    - **Multi-user access** — coworker needs a login. Sees tasks assigned to them and enough account context to execute. Doesn't need full Folio AM access. Org/team layer required — design data model with `org_id` and `assigned_to` from day one so it's not a rewrite later.
    - **Completion feeds change log** — when a task or stage is marked complete, it automatically creates a dated entry on the linked Folio account's change log (item 22 above).

**Already shipped (drop from list):**
- ✅ Quick Tasks — tray on main page, modal with account dropdown + reminder presets, Pip integration (surface open tasks on load, complete/add via natural language)
- ✅ Sub-accounts — UI + migration (`parent_account_id` column live), nested display with faded ↳ arrow on accounts list
- ✅ Pip Summarize with date range (30d / 90d / all time presets, saves to account)
- ✅ Cadence (full nav item, per-account editor, calendar view, open items carry forward)
- ✅ Last interaction tracking (`last_interaction_at` drives days counter on account cards)

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
