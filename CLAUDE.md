# Folio — Claude Development Context

## The Briefcase Suite

Briefcase is a suite of three apps built around account management, conference work, and project tracking. Folio is the hub — Lanyard and Gauge are spokes that punch out from Folio and feed data back.

- **Folio** (`chrisvasconcellos97/Folio`) — year-round account management. Accounts, meetings, pipeline, contacts, open items, Pip AI. The hub.
- **Lanyard** (separate repo) — conference-specific app. Schedule, partner profiles, team chat, personal meeting notes, Pip AI. Punches out from Folio during conferences, feeds notes and partner data back.
- **Gauge** (not yet built) — full project management tool. Serves two audiences: (1) AMs tracking client commitments and deliverables from meetings, (2) PMs and product teams managing deep product development. Both personas live here daily. Feeds project/deliverable status back into Folio account views.

All three apps share the **same Supabase project**: `https://yrpdjmyfidhxlpmxasao.supabase.co`

### Gauge — Build Notes

**Audience:** Not just AMs. Gauge must support a product/project manager who lives in it all day AND an AM who needs to track client commitments. Both use cases are first-class. Simple daily tasks and deep product development workflows both need to feel at home.

**Hierarchy is required.** Work items have depth:
- **Initiative** (top level) — a large body of work, e.g. "2026 Platform Rebuild"
- **Project** — a deliverable set within an initiative, e.g. "API v2 Launch"
- **Task** — the atomic unit of work within a project
- **Subtask** — optional granular step within a task
AMs may only ever work at the Task/Project level. PMs live across all four.

**Vocabulary:**
- A **Commitment** is what an AM promised in a Folio meeting (the origin moment)
- That commitment becomes a **Task** (or Project if it's large enough) in Gauge
- Tasks belong to Projects; Projects belong to Initiatives

**Core features for v1:**
- Task with: title, status, priority, assignee, due date, account link, meeting origin link, comment thread
- Status stages: Backlog → In Progress → In Review → Done → Blocked (flag state)
- Priority: Urgent / High / Normal / Low
- Hierarchy: Initiative → Project → Task → Subtask
- Personal view: "My Tasks" — everything assigned to me across all projects, grouped Today / Upcoming / Later
- Account view: deliverables tied to a Folio account surfaced on that account card
- Board (Kanban) + List views minimum; Timeline (Gantt) in Phase 2

**Signature features (what no other PM tool can do):**

1. **Promise Archaeology** — every task links to the exact Folio meeting note where the commitment was made. The original words, date, and account are visible alongside delivery status. AM confirms "yes, this is what I told them" before a task closes. Traceability from promise to delivery.

2. **Commitment Drift Score** — a live per-account score measuring how far reality has drifted from what was promised (scope changes, pushed dates, aging open items). Revenue-weighted — a drifting $2M account looks different than a drifting $50K account. No PM tool connects delivery slippage to P&L.

3. **Revenue-Weighted Prioritization** — PM backlog can rank by account revenue. Gauge flags when current prioritization is inverted (big account's work deprioritized below small account's work). Makes the business case without politics.

4. **Silence Detector** — monitors the gap between what's late and what the client has been *told* is late. If a task slips and the client hasn't heard anything in Folio (no meeting notes, no logged contact), Pip flags it: "Client hasn't been told yet. That silence is getting expensive."

5. **Before You Say Yes** — when an AM is about to log a new commitment in a Folio meeting, Pip checks the PM team's current Gauge load and responds with: current open items for this account, team capacity, and what happened last time a similar commitment was made. Not a blocker — a conscience.

6. **Commitment Inheritance** — when a project closes, Pip scans final meeting notes for verbal follow-on commitments that were never formally tracked ("we'll revisit this in Q3"). Flags them for the AM to either create or dismiss. Catches the promises that live in wrap-up emails and disappear.

7. **The Handoff Record** — when an AM or PM rolls off an account, Gauge auto-generates a structured Handoff Record: every promise, every delivery outcome, every pattern, plus Pip's relationship temperature read. Forensically accurate, generated from actual history, not a Notion doc nobody maintained.

8. **Account Health vs. Delivery Health Matrix** — leadership view. Relationship Health (Folio signals) on one axis, Delivery Health (Gauge signals) on the other. Four quadrants, four action plans. The "where do I put attention right now?" view for managers. Only possible because Gauge sees both sides.

9. **Pip's Relationship Obituary** — background analysis that flags accounts at churn risk before anyone says the word: commitment drift rising + cadence gaps widening + open items aging + no upsell conversations in meeting notes. Pip's framing: "This account isn't dead yet. Here's what needs to change in 30 days." Churn prediction from relationship data, not product usage data.

10. **The Commitment Ledger** — a read-only, token-based URL an AM sends to a client. Shows every commitment made, when, current status, owner. No login required. Always live. Lightweight SOW tracker that lives between formal contracts. The client never has to ask "what's the status on X?" again.

**Style:**
- Same dark aesthetic as Folio and Lanyard
- Accent color: **blue** (from the Gauge logo — confirm hex before building) — replaces Folio's amber
- Same component patterns, same font (DM Sans), same card/border/bg system — just recolored

**Phase 1:** Any user (AM or PM) can create and manage work. Gauge is usable standalone. Core hierarchy + tasks + signature features above.
**Phase 2:** Deep Folio integration — commitments from meetings auto-graduate to Gauge tasks; Folio account view shows live deliverable status. Get input from OEC product team and PMs before finalizing Phase 2 feature set.

**Same security model as Folio and Lanyard** — shared Supabase, RLS, 2FA inherited automatically.

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

1. **Pip Summarize with date range** — button on the account that sends all meetings within a selected date range to Pip and returns a single relationship summary (last 30 days, last quarter, custom); saves output so Pip isn't called again unless new meetings exist since last summary
2. **Cadence** — recurring meeting hub per account. Set a schedule (e.g. every Thursday at noon), Folio surfaces it automatically. Hub view shows open items pinned at top carried forward until closed, full meeting history, ad hoc meetings linked in. Pip briefs you before you walk in based on full history. New top-level nav item alongside Accounts, Meetings, Pipeline, Pip.
3. **Last interaction tracking** — `last_interaction_at` column on accounts updated via Supabase trigger whenever a meeting, item, or contact is added. Powers the days counter on account cards (currently uses `last_meeting` as a proxy).
4. **Sub-accounts** — parent/child relationship on accounts. One parent (e.g. KSI) holds multiple child brands (e.g. Rogue, BPM Sport). One level deep only. Parent shows a Sub-accounts section; child shows a "Part of [Parent]" badge. Contacts, meetings, items stay on whichever account they belong to. Schema: `parent_account_id uuid references folio_accounts(id)`.

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
- [ ] **Outlook integration** — link Outlook account via Microsoft Graph API (OAuth). Read email addresses from inbox/contacts and automatically match them to existing Folio contacts by email. Surface unmatched addresses as suggestions to create new contacts. Future expansion: pull meeting invites from Outlook calendar into cadence history. Auth flow: Azure AD app registration → OAuth in Folio → store access/refresh tokens in Supabase (new `user_integrations` table).
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
