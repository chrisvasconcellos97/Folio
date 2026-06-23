# Folios — Product Overview

*Last updated: 2026-06-19 (F6 — Pip semantic recall; Monday 1:1 pack; chat agent loop)*

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
  follow-up due, recent meetings, recent updates, systems/tools they use
  (chips, populated via approved Pip suggestions)
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

Cadences can also be **account-less** — a recurring 1:1 with your manager or a
teammate, or an internal/leadership meeting (`cadence_scope='person'`). Action
items from those meetings persist as **leadership tasks** — your own to-dos,
filed under the 1:1 rather than forced onto a customer account — and show in
that cadence's hub.

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
- **Split-screen layout** (desktop): projects panel on the left — each
  project card carries its **own meeting-note field** once marked
  discussed — general notes on the right. Open items and people sit in
  collapsible sections under the projects, including inline add-contact
  so new people met mid-meeting are captured on the spot.
- **Mobile:** a Notes / Projects toggle gives each side of the split the
  full screen, one at a time.
- Per-project notes are stored separately (`project_notes`) so Pip knows
  exactly which notes belong to which project and routes that project's
  action items to it precisely.
- Viewport-filling notepad with bullet-paste preservation
- Autosaves every 1.5s (general and per-project notes alike)
- ESC to close; un-discussing a project with typed notes asks before
  discarding them

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

### Scheduling future one-off meetings

In addition to recurring cadences, you can pin a single upcoming meeting
to a specific date/time. From the Calendar view:

- Click any empty day to open the schedule modal, or use the
  **+ Schedule Meeting** button in the header
- Pick the account (required), date, time, method, and an optional
  agenda note
- The meeting appears on the Calendar, Week, and List views with a
  distinct `◆` chip (distinguished from cadence events)
- Reminders fire at 30m / 5m / start just like cadence meetings
- Today's scheduled meetings surface on the Home screen in a
  "Scheduled Today" card
- Opening the card on or after meeting day flips it into a live draft
  and opens the full-screen meeting mode so the conversation can be
  captured and summarized normally

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

### Team Sheet — the team request tracker

The aftermarket team works a shared Excel request tracker, reviewed in the
weekly team meeting. Folios is the **master** of that tracker; the
spreadsheet is an **output**. Any Gauge project can be flagged "Track on
team sheet," which surfaces it in **Gauge → Team Sheet** — a read-only grid
in the spreadsheet's exact column order (Priority · Date of Request · Owner ·
Supplier · # of Shops · Email Thread · Initiative · Required Completion Date ·
Connection Macro Date · Integration Macro Date · Comments).

Every column except **# of Shops** is generated automatically from the
project (priority, request date, owner, linked account, title, completion
date, latest status pulse). One tap copies the rows that have **changed since
the last export** as tab-separated lines that paste straight into the
spreadsheet's cells. A timing-aware nudge appears on Home on Monday
afternoon / Tuesday morning when tracked projects have unsynced changes.

This kills the two-system drift: instead of maintaining projects in Folios
*and* the sheet by hand, the sheet is generated from Folios. (The
**# of Shops** column is left blank on purpose — that figure is OEC business
data that never lives in Folios; it's filled in Excel. See
`data-handling.md`.)

### Win log & the Friday Pip Wrap

A **win log** (the "brag file") persists the things that went right — a
project landed, a promise kept, a fire put out — so they survive for review
season instead of evaporating. Wins are logged one-tap from auto-detected
candidates (a project completed this week, a commitment kept on time) or
typed in manually. The log lives in **Settings → Pip**, alongside a
**"promises kept" track-record stat** (commitments kept on time vs. slipped),
which also feeds the "is Folios earning its keep?" dashboard.

On Fridays, the **Pip Wrap** card appears on Home — a week-in-review built
**deterministically** (zero AI cost): promises kept/slipped, accounts met
vs. gone quiet, projects that moved, wins logged. A one-tap **"✦ Pip's take"**
adds a single reflective paragraph about *how* the week went (the one optional
AI call, kept cheap and on-demand — the same cost philosophy as the
manual-trigger operator). Everything here is about the user's own work; no
business figures are involved.

### PTO / Away Mode

Folios knows when the user is out, so silence over a vacation reads as "you
were away," not "you dropped the ball." PTO is set as a date range from the
**calendar** ("✈ Set PTO"). Over that window:

- **False alarms are suppressed** — cold-account nudges and off-cadence
  anomaly signals whose quiet stretch overlaps the away window don't fire.
- **The score isn't punished** — commitments that came due while away are
  *excused* from the "promises kept" stat rather than counted as slipped.
- **The return is caught** — when the user is freshly back and pastes their
  catch-up summary (the daily-summary box), the filed items are tagged and
  surface in a **"While you were out"** card on Home that persists until each
  is cleared.

Away periods are personal scheduling only — no business data is involved.

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

### Pip's visual form
Pip has a distinct physical presence across every screen: two glowing
hex-lattice spheres — a head and a smaller tail — suspended inside a
slowly turning hexagonal ring. The whole figure breathes together on a
2.4-second cycle: the ring swells, the sphere hexes open and close, and
the core glow pulses, all in sync. The 3D scene renders via an SVG
animation loop and re-skins automatically when the accent token changes
(Work mode teal → Life mode dusty orange). Smaller instances (≤32px)
stay as the classic two-circle form since the hexes mush at small sizes.
The design is locked and enforced by an automated CI test — parameters
cannot drift without a visible failure.

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

**Model tiering.** Pip runs the right model for each task. The
reasoning-heavy, user-facing, low-frequency surfaces — Ask Pip chat,
meeting summarize, portfolio question generation, the daily brief,
profile synthesis, and the QBR — run on **Sonnet 4.6**. High-volume or
mechanical surfaces — per-account Brief Me, follow-up email drafting,
terminology extraction, memory compression, and the leadership readout —
run on **Haiku 4.5**. Each Sonnet surface has an environment override so
its tier can be re-dialed without a code change. (See
[ai-governance.md](./ai-governance.md) for the full matrix.)

**How Pip writes.** Every Pip text surface — chat, the daily brief, meeting
summaries, Brief Me, the cadence pre-call brief, and the QBR — renders
structured output: a short headline, labeled sections, and scannable bullets
with the important names in bold, instead of a wall of prose. Priority
sections can carry one of Pip's own inline status glyphs (a small on-brand
icon set — needs-now, keep-an-eye, good-news, cross-account-pattern, done) in
place of generic emoji, so a brief reads at a glance. Email drafts stay plain
prose (no markup) since they're meant to be sent as-is.

### Autonomous Operator — Pip works the book on demand

Pip is not only pull-triggered. A manual operator pass sweeps the portfolio
on demand, so the user can run it when they want a fresh read rather than
staring at a dashboard to interpret.

**How to run:** tap "Run Pip's pass" on the Home screen. The pass takes
20–40 seconds and updates the operator report when complete. The Vercel
nightly cron was retired June 2026 (it ran every morning regardless of
whether the app was opened, burning tokens on quiet days).

- **Signal-gated sweep.** The operator job reviews the book and runs a deep
  per-account pass *only on the accounts that moved* since the last run (new
  activity, or a health/at-risk signal). Accounts that didn't change are
  skipped — cost and effort scale with what actually changed, not with
  portfolio size. The per-account passes are capped per run.
- **Materialized operator state.** For each worked account Pip writes a
  durable state object: a read of the situation, the risks, a **pre-drafted
  follow-up email** where one is warranted, proposed task/project moves, a
  pre-built cadence agenda, and a "what changed since last run" delta. This is
  stored, not regenerated on every screen open — surfaces read it instead of
  making their own model call.
- **The operator report.** Those per-account reads roll up into one
  prioritized report on the Home screen: the plan for the day, with the
  drafted follow-ups ready to review and send. It replaces the live daily brief
  on days the pass ran ("here's what's happening" becomes "here's what's
  happening, and I drafted the first pass of it").
- **Surfaced across the app, one brain.** The same materialized state is read
  directly by every relevant surface — no extra model call when a screen opens:
  the **account screen** shows a full operator panel (situation, "since last
  run" delta, risks, the drafted email, and proposed moves you approve or
  dismiss one tap at a time); the **Cadence Hub** shows the pre-built agenda
  before a call; the **Gauge Pip card** shows proposed moves as a cross-account
  decision queue. Approving a proposed move creates the task; the proposal is
  then marked handled so it doesn't reappear.
- **Propose, don't act.** Everything the pass produces is a draft the user
  approves — nothing is created live and nothing is sent automatically. This
  keeps the data boundary clean: Pip never reaches outside Folios.
- **Cost scales with change, not size.** The deep per-account pass only runs on
  accounts that moved since the last run, capped per pass, plus one portfolio
  roll-up — so each run's spend tracks what actually changed across the book.

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

   **Phase 2 — drip questions.** After onboarding, Pip keeps learning via
   a "Pip's Curious" card on the Home screen — one question at a time,
   inline textarea, never a modal. Soft cap of 5 per rolling 24h with no
   skip cooldown, so you can power through several in a sitting. Every
   question comes from real observed data — there is no generic
   "get-to-know-you" filler (that was removed; the well staying silent
   beats the well being fake). Sources:
   - **Structural gaps (zero LLM cost):** contacts who appear in ≥3
     meetings but have no role recorded, active accounts past 30 days with
     no objective, and empty profile slots post-onboarding.
   - **Terminology lane (Lane C):** a daily Haiku scan of recent meeting
     notes surfaces proper nouns / brand names / codenames that appear ≥3
     times but aren't a known account, contact, or glossary term. Each
     question is account-anchored ("you keep mentioning Fuse5 around John's
     Auto Parts — what is it?"). Answers write to `folio_pip_facts` so
     future briefs know the company's vocabulary automatically.
   - **Portfolio generator (Lane D):** a low-frequency Sonnet pass reasons
     across the whole portfolio and writes a few genuinely insightful
     questions in Pip's voice. It self-skips (a DB count, no model call)
     whenever the queue already holds ≥5, so it only spends when the queue
     has actually drained.

   Answering ≥3 drip questions since the last synthesis triggers a
   background re-synthesis so `profile_prose` stays current. Settings →
   "Pip's Questions" has a global pause toggle and a completeness meter.
   Cost: gap detection = $0; terminology + generator ≈ $0.01–0.02/month;
   re-synthesis ≈ $0.004 per batch.

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

5. **Structured suggestions ("Pip proposes, you approve").** When a
   drip question is *about* something structured — a contact's role, an
   account's objective, or a tool/system the account uses — the intent is
   attached to the question when it's created (Pip already knows which
   account or contact it's asking about). On answer, the card shows a
   pre-checked "Also save to…" toggle: keep it checked and the answer is
   written to the real field (`folio_contacts.title`,
   `folio_accounts.objective`, or the account's `systems` list); untick
   it to keep the answer as a plain fact. One tap, human in the loop —
   nothing mutates silently, and it never touches health or tier. The
   "systems" an account uses (e.g. "Fuse5 is their IMS") surface as chips
   on the account Overview and ride into every per-account Pip surface, so
   when "Fuse5" later shows up in raw notes Pip knows what it is instead of
   asking again. No per-answer model call — the structured write is free.

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

### Pip — semantic recall (pgvector)

Recency context only ever shows Pip the *latest* N meetings on an account. Some
of the most useful context is older — a decision made six months ago, a
constraint a contact mentioned once. Semantic recall closes that gap: Pip can
pull the most relevant past notes by **meaning**, not date.

**How it works.** Folios keeps a vector index (`folio_embeddings`, Postgres
pgvector) of the user's own content — meeting notes, Pip's meeting summaries,
per-project meeting notes, and account updates. A daily background sweep embeds
anything new or changed (each source carries a content fingerprint, so nothing
is ever re-embedded unchanged — the running cost is effectively zero). When the
user asks Pip a question, the question is embedded and the closest past notes
are retrieved — account-scoped when the question is about one account, or across
the whole book for "what did we ever decide about X" questions — and folded into
Pip's context through the same shared context builder every Pip surface reads
from, so recall reaches chat by construction.

**Privacy & data line.** Recall is strictly the user's own content, RLS-scoped
to them and account-scoped by default (the retrieval function runs under the
caller's identity with an explicit owner check). Only data-line-clean text is
embedded — no revenue, volumes, or rosters. Recall stays inert until an
embeddings key is configured; without it, Pip simply falls back to recency.

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

### Pip — portfolio intelligence ("chief of staff")

Pip sees your entire portfolio at once, not just one account at a time.

- **Daily account state snapshots** (`folio_account_snapshots`): computed
  once per day, client-side, from real signals — health status, days since
  last contact, open and overdue item counts, active and stuck Gauge project
  counts. Zero LLM cost; pure data derivation.
- **Daily brief card on the Home screen**: one call per day, cached for the
  calendar day. Pip synthesises a morning read across the whole portfolio —
  what's due, what's at risk, recent wins — factoring in workload (overdue
  tasks, commitments, today's cadences), cross-account themes, tone trend,
  health momentum, and **off-cadence accounts vs. their own rhythm** (e.g.
  "you usually meet every ~3 weeks; it's been 45 days" — a personal baseline,
  not a generic cold threshold).
- **Draft-ahead follow-ups**: Home surfaces meetings you summarised a couple
  days ago that still have no follow-up logged, with the follow-up email Pip
  already drafted ready to copy or send — no extra cost.
- **Boss-ready leadership readout** and **pre-call standing agendas** (via the
  cadence brief) round out the proactive layer.
- **Portfolio state utility (`buildPortfolioState`)**: a compact text block
  summarising at-risk / watching accounts and stuck projects, injected into
  cross-portfolio Pip surfaces.

### Pip — the Monday 1:1 pack

An auto-assembled prep sheet for your weekly 1:1, so nothing surprises you in
front of your boss. It surfaces on the Home screen on Monday (and as a Sunday-
evening heads-up) and opens into the full pack inside that 1:1's cadence hub.
The pack reads top to bottom:

1. **Pip's read** — one to three sentences framing the week.
2. **Your word** — promised-vs-done: the week's commitments, each marked
   **Kept / Slipped / Open**, with the account.
3. **Boss's open asks, pre-answered** — Pip pulls the asks from your last 1:1's
   notes (and the open leadership tasks tagged to that 1:1) and attaches the
   current status to each, so you walk in with the answer ready.
4. **What moved, by account** — the week's per-account delta: meetings, Gauge
   status pulses, deliveries.
5. **Who has the ball** — waiting-ons: what you owe vs. what's owed you.

Almost all of it is **deterministic assembly over data you already captured** —
zero AI cost and always fresh. Only the read + the boss-ask extraction use a
model, folded into **one Sonnet call per week**: the output is cached on the
cadence row and regenerated only when the week's content actually changes
(the same event-driven gating used for Pip's per-account state), so a quiet
week never re-bills. The boss-ask extraction reads what you already type — there
is **no extra tagging step**. Data Line Rule applies throughout: asks and
statuses are directional, never numbers, and your raw 1:1 notes are read, never
rewritten.

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

A project can be linked to multiple accounts — the account field is a
searchable picker (search → pick → chip → search again), so a project
that touches several accounts is filed under all of them.

### Notes vs. status updates

Each project carries two distinct text surfaces:

- **Notes** — a durable scratchpad for context, decisions, and
  background that stays put.
- **Status updates** — an append-only, timestamped pulse log. Posting
  an update prepends a new entry (body + timestamp + author); the
  expanded card shows the latest pulse ("Updated 2h ago"), and the
  project edit screen shows the full history. Pip reads the latest
  update (plus the prior two) so briefs can say "All Star — latest:
  'waiting on legal sign-off' (Jun 3)."

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

## Work / Life mode

Folios has two top-level modes — **Work** (green palette, account
management) and **Life** (dusty-blue palette, personal assistant).
A toggle in the desktop rail (bottom-left) and the mobile header
switches modes instantly; the app recolors via CSS custom property
swap, same mechanism as the light/dark theme.

**Work mode** is the full account management OS — accounts, cadences,
Gauge, calendar, meetings. Unchanged by the Life build.

**Life mode** (Phase 1, June 2026) surfaces:
- **Upcoming** — appointments and events, with a VIP heads-up ladder
  (anniversary / spouse's birthday / Christmas get multi-stage escalating
  nudges: 3wk soft → 1wk → 3d → 1d → day-of; annual recurrence set once)
- **Honey-do list** — open home tasks prioritized by aging + complexity
- **Soccer card** — Man United / Brazil / USMNT news + scores (moved
  from work Home into Life Home)

Phase 2 (planned) = honey-do brain: Pip as a home-project partner with
how-to coaching, materials lists, and step-by-step guidance.

Pip's orb recolors to dusty orange in Life mode (reads `--accent`).
Both modes share one Supabase project and one Pip brain.

---

## Mobile Home — structured hub

The mobile Home screen is an `OperatorHub` layout (since June 2026):
a compact Pip glance card (headline chip + count chips + collapsed full
read) followed by section cards (Today / This Week / Good News / Pattern)
with tinted header strips, count badges, and clean stacked rows. An
"On the Calendar" card surfaces same-day meetings. Redundant narrative
panels are suppressed when an operator report is active.

---

## Teach Pip — on-demand knowledge-building

Beyond the passive weekly drip question, the user can open a "Catch up
with Pip" session anytime (Home card when no question is queued, or
Settings → Pip's Questions). The session works through the question
queue and offers a "Pip, ask me more →" button that fires a fresh
manual generation pass (bypassing the 6-hour throttle) so the session
never dead-ends. Deterministic account-anchored fallback questions
guarantee at least one question per session even when the model
abstains. Every answer folds into `profile_prose` and `folio_pip_facts`
within minutes (re-synthesis throttled at 5 min).

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
