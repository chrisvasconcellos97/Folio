# Folio — Claude Development Context

## The Briefcase Suite

Folio and Lanyard are two apps that make up **Briefcase**, a personal account and conference management suite built for a sales team attending ABPA 2026.

- **Folio** (`chrisvasconcellos97/Folio`) — year-round account management. Accounts, meetings, pipeline, contacts, open items, Pip AI.
- **Lanyard** (separate repo) — conference-specific app. Schedule, partner profiles, team chat, personal meeting notes, Pip AI.

Both apps share the **same Supabase project**: `https://yrpdjmyfidhxlpmxasao.supabase.co`

---

## Folio — Current State

- React + Vite, hosted on Vercel
- Supabase Auth (real email/password accounts)
- Tables: `folio_accounts`, `folio_contacts`, `folio_meetings`, `folio_items` — all with RLS tied to `auth.uid()`
- Pip AI proxy at `api/pip.js` using `claude-haiku-4-5-20251001`, requires `ANTHROPIC_API_KEY` in Vercel env vars
- Schema is in `supabase/schema.sql` — already run in production
- Deployed and live as of May 2026

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
| `sessions` | `"abpa2026_team"` | Conference schedule events (shared, all teammates see same data) |
| `partners` | `"abpa2026_team"` | Partner/account profiles (shared) |
| `user_prefs` | `"u_<uid>"` | Hotel info, quick notes (personal) |
| `user_prefs` | `"u_<uid>_notes"` | Personal meeting notes per session (private) |
| `share_codes` | — | Temporary codes for syncing between teammates |
| `notifications` | — | Team activity feed (built, SQL not yet run) |
| `messages` | — | Team chat, DMs, shoutouts (built, SQL not yet run) |

Data stored as JSON blobs in a `data jsonb` column.

### The auth problem
Because `lanyard_uid` lives in localStorage, clearing the browser or switching devices generates a new ID and breaks the Supabase lookup for personal notes. Shared partner/session data (under `"abpa2026_team"`) is safe from any device. **Adding real Supabase Auth to Lanyard is the top priority for the next build.**

---

## Folio ↔ Lanyard Integration — Current Status

**Goal**: Surface Lanyard conference partner data and meeting notes inside Folio so everything lives in one place after the conference.

**What maps between the two:**
- Lanyard `partners` → Folio `folio_accounts` (name, revenue, tier, status, contacts, objectives)
- Lanyard personal meeting notes (`user_prefs` with `_notes` suffix) → Folio `folio_meetings`

**Blocker**: Lanyard personal notes are keyed to the anonymous `lanyard_uid`. To import them into Folio, we need that ID. The user took all notes on iPhone Safari — the `lanyard_uid` is in that browser's localStorage.

**Plan once we have the ID:**
1. Query `user_prefs` in Supabase to retrieve all personal notes
2. Write a SQL migration to import Lanyard partners → `folio_accounts` and notes → `folio_meetings` tied to the user's Folio `auth.uid()`

---

## Pip

Both apps use the same Pip personality — a loyal, slightly anxious field analyst. Pip has access to account/meeting context injected into the system prompt. Model: `claude-haiku-4-5-20251001`.

---

## Supabase

- Project URL: `https://yrpdjmyfidhxlpmxasao.supabase.co`
- Same project for both Folio and Lanyard
- Folio tables have proper RLS via `auth.uid()`
- Lanyard tables use text `user_id` fields (not auth UUIDs)

---

## Open TODOs

- [ ] Recover Lanyard personal notes from iPhone Safari localStorage (`lanyard_uid`)
- [ ] Import Lanyard partner data into Folio accounts
- [ ] Add real Supabase Auth to Lanyard
- [ ] Run `notifications` and `messages` SQL in Supabase to activate those Lanyard features
- [ ] Connect Folio and Lanyard data bidirectionally once Lanyard has real auth
