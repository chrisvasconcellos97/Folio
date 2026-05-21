# Folio — Claude Development Context

## The Briefcase Suite

Folio and Lanyard are two apps that make up **Briefcase**, a personal account and conference management suite built for a sales team attending ABPA 2026.

- **Folio** (`chrisvasconcellos97/Folio`) — year-round account management. Accounts, meetings, pipeline, contacts, open items, Pip AI.
- **Lanyard** (separate repo) — conference-specific app. Schedule, partner profiles, team chat, personal meeting notes, Pip AI.

Both apps share the **same Supabase project**: `https://yrpdjmyfidhxlpmxasao.supabase.co`

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

1. **Quick Meeting button** — one tap on an account creates a meeting stamped with today's date, skips optional fields, drops you straight into notes
2. **Pip Summarize with date range** — button on the account that sends all meetings within a selected date range to Pip and returns a single relationship summary (last 30 days, last quarter, custom); saves output so Pip isn't called again unless new meetings exist since last summary
3. **Loading skeleton on accounts list** — replace the "0 accounts" flash on load with a proper loading state so it's clear data is coming in
4. **Upcoming meeting alerts** — surface accounts with meetings in the next 7 days when opening the app; Pip flags them with context
5. **Cadence** — recurring meeting hub per account. Set a schedule (e.g. every Thursday at noon), Folio surfaces it automatically. Hub view shows open items pinned at top carried forward until closed, full meeting history, ad hoc meetings linked in. Pip briefs you before you walk in based on full history. New top-level nav item alongside Accounts, Meetings, Pipeline, Pip.

---

## Feature Wishlist / Roadmap

### High priority
- [ ] **"Ask Pip" button on meetings** — generates summary, cleaned notes, draft email on demand; saves result to `pip_summary` / `pip_email` so it's never regenerated
- [ ] **Pip context improvement** — pass full account history (all meetings, open items, contacts) into Pip system prompt for richer responses
- [ ] **Revenue field formatting** — currently free text, should be a number field with proper formatting and sorting
- [ ] **Last meeting auto-update** — when a meeting is logged, auto-set `last_meeting` on the account

### Medium priority
- [ ] **Email integration** — one-tap to open draft follow-up email in mail client (`mailto:` link pre-populated)
- [ ] **Open items on meetings** — when logging a meeting, action items should optionally auto-create open items
- [ ] **Account search improvement** — search across contacts and notes, not just account name
- [ ] **Pipeline filters** — filter by tier, status, revenue range
- [ ] **Notifications / reminders** — flag accounts with no contact in X days, overdue items

### Cadence (once built)
- [ ] **Cadence analytics** — meeting frequency per account, open item age, account health trends over time, Pip flags accounts untouched in 30+ days. Hold until enough data exists to make it meaningful.

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
