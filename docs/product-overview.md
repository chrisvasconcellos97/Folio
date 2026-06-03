# Folios — Product Overview

*Last updated: 2026-06-03*

This is the substantive product read after the [one-pager](./one-pager.md).
Covers what Folios does, how it's structured, and what makes the Pip
layer different from "AI bolted onto a CRM."

---

## Product framing

**Folios is the year-round relationship-management workspace for
external account managers.** It captures the work of relationship
management — meetings, follow-ups, commitments, context — and gives
that work an intelligence layer that gets better over time.

The product is named **Folios** (plural). The GitHub repo is
`Folio` (singular) for historical reasons.

### The three modules under the Folios umbrella

```
            ┌──────────────────────────────┐
            │           FOLIOS             │
            │  (account management OS)     │
            └──────┬──────────────────┬────┘
                   │                  │
       ┌───────────▼────────┐  ┌──────▼─────────────┐
       │      LANYARD       │  │       GAUGE        │
       │ (conference module)│  │ (project & tasks)  │
       └────────────────────┘  └────────────────────┘
```

- **Folios** — the main app. Accounts, contacts, cadences, meetings,
  open items, Pip AI. The everyday surface.
- **Lanyard** — conference-specific module. Pulls into focus during
  trade shows (schedule, partner profiles, team chat, in-person
  notes). Feeds notes back to Folios after the conference.
- **Gauge** — project & task management module. Tracks commitments
  from meetings into trackable projects (discrete and standing). Will
  expand to a full PM tool used by cross-functional product/ops teams.

All three share the same Supabase backend, the same auth, the same Pip.

---

## Core capabilities

### Workspaces

Folios organizes accounts into three workspace types, all sharing the
same underlying model:

- **Accounts** — customer-facing relationships (standard, MSO, shop)
- **Departments** — internal teams (sales, ops, product, etc.)
- **Partners** — vendor / supplier / channel relationships

The conditional UI changes per type (Accounts show revenue / tier;
Partners show agreement terms; Departments hide both). Pip's context
also branches per type so it asks the right questions about each.

Sub-accounts are supported via `parent_account_id` (e.g., parent MSO
holds child shops; parent customer holds child divisions).

### Account detail

Each account gets its own command center:
- **Overview** — health (auto-computed), context notes (read by Pip),
  follow-up due, recent meetings, recent updates
- **Cadences** — recurring meeting schedules
- **Meetings** — all conversations with the account
- **Items** — open action items
- **Contacts** — people on the account
- **Projects** (Gauge) — active deliverables
- **Updates** — change events (catalog/pricing/integration/etc.) for
  revenue-impact analysis
- **Shops** (MSO type only) — child shops

### Cadences

A cadence is a recurring meeting schedule attached to an account.
Define the frequency (weekly / biweekly / monthly / quarterly), day of
week, and optional time. Folios:

- Auto-computes the next due date
- Sends in-app + browser-notification reminders 30m / 5m / start
- Auto-advances when a conversation is logged tied to it
- Surfaces the Cadence Hub when due

### Cadence Hub

Pre-call command center for any account/cadence. Opens to:

- **Pip brief** — short pre-call read on the relationship state
- **Big Start Meeting button** — auto-creates a draft and opens
  full-screen meeting mode
- **Active Gauge projects** — expandable inline
- **Open items** — what's hanging
- **Follow-ups** — what's promised
- **History** — every prior conversation

Mobile uses a 4-tab segmented control (Notes / History / Tasks /
Follow-ups) for compactness.

### Full-screen meeting mode

Distraction-free conversation capture. Opens over the global chrome:

- Top bar with End & Summarize
- Collapsible sidebar with Pip brief, projects, open items, contacts
- Viewport-filling notepad with bullet-paste preservation
- Autosaves every 1.5s
- ESC to close

On End & Summarize, Pip generates a structured plan (action items,
project updates, follow-ups) and the user reviews it in the
[summarize-preview modal](#pip--the-summarize-preview-modal) before
applying.

**Discussed signal:** during a meeting the user can tap any project card
or open-item row in the sidebar to flag it as "discussed this meeting."
Flagged cards show a teal ✦ Discussed chip. As the user types notes, the
sidebar also auto-highlights any project or item whose title appears in
the notes with a subtle glow — giving visual confirmation Pip will
connect the dots before hitting summarize. Flagged IDs are passed to Pip
at summarize time so Pip strongly prefers updating or closing those items
instead of creating new duplicates. Rows in the plan modal that touch a
flagged project or item show a ✦ Discussed badge so the user can see Pip
acted on the signal.

### Logging conversations (non-cadence)

For ad-hoc calls outside a cadence, the global "+ Conversation" button
opens a modal: pick the account, pick the method, pick the date, then
open the same full-screen meeting mode. The conversation files under
the account's Meetings tab tagged `AD-HOC`.

### Open items

Lightweight action-item tracking per account. Items can be:
- Manually added
- Auto-created by Pip from meeting notes (with `pip_created_at`
  marker so the V2 brain can detect post-creation edits)
- Carried forward across cadence meetings (open items show up in the
  next meeting's prep view)

Items support due dates, assignees (org members), and completion.

### Quick Tasks

A floating tray for fast-capture tasks that don't belong to a specific
account. 2-second log without leaving whatever screen you're on. Same
underlying row shape as project tasks.

### Update Calendar

Manual change-event log per account. Categories: catalog, pricing,
integration, product launch, training, promo, external event, other.
Each entry has a date, title, description, owner, observed impact.

The value: when revenue dips on an account, you can correlate against
the update timeline to see what changed and when. (Revenue surfaces
themselves have been removed from the personal-mode build — see
"Ripped" in CLAUDE.md — but the change-event log remains valuable.)

### Inactive & Merge

No hard deletes for accounts or users. Everything is reversible:

- **Inactive flag** — soft archive. Greyed out in lists, excluded
  from Pip's "needs attention" counts. Can be reactivated.
- **Merge into…** — for acquisitions. Re-parents every child row
  (meetings, items, contacts, cadences, projects) from source → target,
  then marks source inactive. Linked back so history is preserved.

---

## Pip — the AI field analyst

Pip is the differentiator. Embedded in every meeting, every account
view, every brief.

### Pip's personality
Loyal, slightly anxious field analyst. Same voice across all
surfaces — meeting summaries, briefs, chat answers, error
recovery messages. Personality is intentional: feels like a real
teammate, not a generic chatbot.

### Pip's modes

| Mode | What it does | When it fires |
|---|---|---|
| **summarize** | Turns meeting notes into a structured plan (new items, updated items, closed items, project updates, follow-ups) | End & Summarize on a meeting |
| **brief** | Pre-call brief for an account (relationship state, what's at stake) | "Brief Me" button on Cadence Hub |
| **ask** | Conversational chat — ask anything about your accounts | Pip view (chat surface) |
| **plan / extract** | One-shot extraction of action items from short notes | Quick Touchpoint modal |

### The V2 brain — Pip's learning loop

This is the differentiator that nothing else does. Pip doesn't
just generate text; Pip *learns* from how the user reacts to its
output.

**Four learning surfaces:**

0. **User profile (`folio_user_profile` + `profile_prose`).** At first
   login, Pip interviews the user with 5 questions (role, company, portfolio,
   goals, communication style). Answers are synthesized into a 4–8 sentence
   `profile_prose` narrative injected into every Pip response — chat and
   summarize equally. Pip now knows who it's talking to, not just what
   accounts they have. Soft-gated: interview is skippable and resumable.
   Existing users see a dismissible HomeView card. Cost: ~$0.002 once.

   **Phase 2 — drip questions.** After onboarding, Pip continues learning
   via a gentle weekly drip. Once per day (max 3 per rolling 7 days, 48h
   cooldown after any skip), a "Pip's Curious" card appears on the Home
   screen with one question at a time — inline textarea, never a modal.
   Three gap types are auto-detected (zero LLM cost): contacts who appear
   in ≥3 meetings but have no role recorded, accounts past 30 days with
   no objective, and empty profile slots post-onboarding. An evergreen
   bank of 15 get-to-know-you questions ensures the well never runs dry.
   **Terminology lane (Lane C):** once per week, a Haiku scan of recent
   meeting notes surfaces proper nouns / brand names / codenames that appear
   ≥3 times but aren't a known account name, contact, or glossary term.
   Pip asks what they are — answers write directly to `folio_pip_facts` so
   future briefs know the company's vocabulary automatically. Answering ≥3
   drip questions since the last synthesis triggers a background re-synthesis
   so `profile_prose` stays current. Settings → "Pip's Questions" has a
   global pause toggle and a completeness meter. Cost: gap detection = $0;
   terminology scan ≈ $0.01/month; re-synthesis ≈ $0.004 per batch.

1. **Correction log (`pip_correction_log`).** Every time the user
   declines a proposed action, edits the text of a Pip-created item,
   reassigns a task, or rejects a routing decision, the correction is
   captured. Pip reads the last 10 corrections per account on every
   summarize call and is explicitly told "Chris has corrected these
   before — don't repeat."

2. **Lessons learned (`pip_account_state.lessons_learned`).** Every
   ~5 meetings, a cheap compression pass distills the recent
   correction log into a stable paragraph stored per account. Pip
   reads this paragraph instead of the raw log, keeping the read-back
   context small but the institutional memory permanent.

3. **Assignment hints (`pip_assignment_hints`).** When the user
   reassigns a task in the summarize-preview modal (e.g., changes
   assignee from "Mark" to "Sara" for invoice work), the pattern is
   captured. Pip routes the next similar task to Sara automatically.
   Hints scope: account-specific first, then org-wide ("Sara does
   invoice work everywhere").

4. **Glossary (`pip_glossary`).** Users can teach Pip terms,
   acronyms, and aliases (e.g., "ProParts was the legacy name for
   KSI Collision"). Pip respects glossary aliases when matching
   account names in notes.

**Cross-account routing.** Pip can route a task from one account's
meeting to a different account's plate. Example: "ACME meeting, but
I need to follow up with KSI on the invoice feed" → task created on
KSI, source backref points to the ACME meeting. The V2 brain handles
the routing decision with a `target_account_id` field on each plan
row. User can override in the preview modal.

**Internal-meeting prior.** When the meeting is on an internal-team
account (`account_type = 'internal_team'`), Pip's default flips —
it expects tasks to fan out to customer accounts, not stay on the
internal account.

### Pip — the summarize-preview modal

After Pip generates a meeting plan, the user reviews it before
anything is applied. The modal shows every proposed action as a
row with:

- Checkbox (default checked — uncheck to decline)
- Editable title (fix wording before applying)
- Account chip (override the routed account if Pip got it wrong)
- Assignee dropdown
- Due date picker
- "See source" link → expands the slice of the user's notes that
  triggered the row (editable; edited excerpts feed back as
  correction reasons)
- "Add missed item" button at the bottom for things Pip didn't catch

Grouped into Changes / New / Skipped. Yellow dot on low-confidence
rows. Apply runs the selected rows through real DB writes. Cancel
preserves the summarized meeting but applies nothing.

### Pip — cost optimization

- **Model selection**: claude-haiku-4-5-20251001 for default Pip
  operations. Sonnet only for high-synthesis paths (Brief Me).
- **Stacked prompt caching**: 4 cache breakpoints (system /
  glossary / roster / items+tasks). Multi-call sessions get ~70%
  cache hit rate.
- **Trivial-draft short-circuit**: drafts under 100 characters
  never call the API.
- **Per-user usage telemetry**: `folio_pip_usage` tracks every
  call (tokens, mode, timestamp); visible to user in Settings.
- **Rate limiting**: 20 req/min per user.

### Pip — voice

- Speech-to-text via browser Web Speech API (free, browser-native).
- Text-to-speech via browser SpeechSynthesis today (free, but the
  voice quality is poor).
- Premium voice (OpenAI / Cartesia / ElevenLabs) on the wishlist.

### Pip — portfolio intelligence (Tier A)

Pip now sees your entire portfolio at once, not just one account at a time.

- **Daily account state snapshots** (`folio_account_snapshots`): computed
  once per day, client-side, from real signals — health status, days since
  last contact, open and overdue item counts, active and stuck Gauge project
  counts. Zero LLM cost; pure data derivation.
- **Daily brief card on the Home screen**: a single Haiku call, cached in
  localStorage for the full calendar day. Pip synthesises a 3-5 sentence
  morning read across the whole portfolio — what needs attention, what's at
  risk, any recent wins. Cost estimate: ~$0.07/month.
- **Portfolio state utility (`buildPortfolioState`)**: a compact text block
  summarising at-risk / watching accounts and stuck projects. Ready to be
  injected into any future Pip context that needs cross-portfolio awareness
  (1:1 mode, boss-ready rollup, etc.).

---

## Gauge — projects & tasks

Gauge is the project-management module that lives under the Folios
umbrella. Phase 1 is AM-facing; Phase 2 will expand to a full
cross-functional PM tool.

### Project types

**Discrete projects.** AM-owned, multi-step, has a finish line.
The AM is the conductor; individual steps have assignees who may
or may not be the AM. Example: an audit with 7 steps, 3 different
people involved.

**Standing projects.** Admin-owned reactive queues. No sequence,
no finish line. AMs (and Pip) drop tasks in; admin clears them.
Example: an "Invoice Updates" inbox.

### Custom fields

Each project defines its own custom field schema (text, longtext,
number, date, dropdown, person, checkbox, URL). A "bones" preset
provides defaults (Priority, Owner, Submission Date, Due Date,
Description, Related Link) when starting blank.

### Standing board view

Standing projects render as a kanban board inside the project row.
One column per `task_status_columns` entry. Tasks drag between
columns; admin processes left-to-right.

### My Queue view

Flat task list across all projects the current user is assigned to.
Live / Planning / All sub-filters. Optional group-by-project toggle.

### Gauge — three lenses (queued, not yet built)

The next major Gauge build introduces three role-based default
views set at invite time:

- **AM lens** — your accounts, your projects, your queue
- **Leader lens** — team rollup, who's stuck, what's overdue
- **Admin lens** — flat task queue, due dates, account chip
  per row

Pip's prompt branches per lens for role-appropriate framing.
Same UI shape; different defaults and Pip context.

Full spec lives in CLAUDE.md → section 14 → Gauge V3.

---

## Team & org layer

Multi-tenant ready from day 1:

- `folio_orgs` — org name, plan
- `folio_org_members` — user → org → role
- Roles: `owner | admin | member`
- All user-data tables carry `org_id` (or are linked via account)
- RLS policies scope to org membership where appropriate

Today: single-user pilot, no real org sharing in production.
Architecture is ready when team mode lights up.

---

## Light + dark themes

Full design system supporting both palettes. Tokens defined as CSS
custom properties on `<html data-theme="…">`. Pre-mount inline script
prevents flash-of-wrong-theme. Settings → Appearance for toggle.

Dark is the canonical palette for layout decisions; light is the
spec'd translation. Light-mode-specific behaviors (hover lifts, mark
pulses) are scoped via `[data-theme="light"]` so dark renders cleanly.

---

## Mobile / PWA

Folios is mobile-first:

- Installable as a PWA on iOS and Android
- Offline-capable shell (service worker)
- Two redundant auto-update paths (controllerchange + version polling)
- Safe-area-aware layouts
- 16px minimum font on all inputs (prevents iOS auto-zoom)
- Bottom nav: Home / Accounts / Calendar / Gauge
- Settings/diagnostics/etc. tucked into the user menu

---

## Observability

Self-monitoring built in:

- **`folio_errors`** — every React render error, network failure,
  Pip error, unhandled rejection lands here with stack + context.
  Visible in Settings → Diagnostics.
- **Auto-recovery** — stale-chunk Lazy import failures (post-deploy
  edge case) detected and reloaded silently; marked auto-resolved.
- **Connection status** — UI indicator when Supabase realtime drops.
- **Render-time `timed()` helper** wraps hot paths for performance
  diagnostics.

---

## What's NOT in Folios (deliberate)

- **Pipeline / revenue tracking** — ripped from the personal-mode
  build. Compliance blocks real revenue ingestion. Schema preserved
  for future re-build if corporate-data integration becomes possible.
  See CLAUDE.md → "Ripped (deliberate simplification)" for the
  inventory of what was pulled.
- **Email integration** — no inbox sync, no auto-log from email
  threads. Pip operates on notes the user explicitly captures.
- **CRM sync** — no Salesforce / HubSpot bidirectional sync today.
- **Automatic transcription** — meeting notes are user-typed (or
  voice-dictated). No Otter-style auto-transcribe from a Zoom feed.

---

## Roadmap snapshot

For the current shipping queue and wishlist, see CLAUDE.md →
"Pending Updates" and "Feature Wishlist / Roadmap" sections (internal
working doc). A presentation-facing roadmap.md is planned.

Highlights of what's next:
- **Gauge V3** (three role-based lenses + unified `folio_tasks` table
  + project templates + Leader project view) — spec'd, queued.
- **Premium TTS for Pip** (OpenAI / Cartesia / ElevenLabs) — wishlist.
- **Pip's weekly clarifying questions** — spec'd, depends on more
  correction-log data first.
- **Active session management UI** — for multi-device sign-out.

---

## Contact

chris.vasconcellos97@gmail.com
