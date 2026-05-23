# Folio — Claude Development Context

## Deployment Rule
**Vercel production branch is `claude/build-folio-desktop-app-XzvZ5`.** Always push to both `main` AND this branch on every commit:
```
git push origin HEAD:main
git push origin HEAD:claude/build-folio-desktop-app-XzvZ5
```
Never push to only one of them. **Do NOT push to any other branches** (session feature branches, etc.) — Vercel counts every branch push toward its 100 deployments/day free tier limit.

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
