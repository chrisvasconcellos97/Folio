# Folios — Upgrade Log

*Last updated: 2026-06-03 (Meeting discussed signal + Pip drip questions Phase 2)*

Plain-English log of major upgrades shipped to Folios. Date, time, and
a short explanation written in terms anyone can read — not technical
release notes.

For the technical changelog with full release detail, see
[changelog.md](./changelog.md). For day-to-day commit history, see
`git log` on the production branch.

**What gets logged here:** major feature shipments, schema migrations,
architectural changes, anything that meaningfully changes what Folios
*does* or *is*. Not bug fixes, styling tweaks, or doc-only updates —
those live in git history.

---

## 2026-06-03 — Meeting discussed signal — Pip now knows what you talked about

**What I built:** Two interlocked features that fix Pip's #1 failure mode: creating
duplicate tasks instead of updating the ones you already discussed.

**Problem it solves:** During a meeting, you might talk through three open Gauge
projects and two open action items. Pip gets your notes as free text and has to
guess which of your active projects and items you actually touched. It defaults to
creating new rows when it's unsure — which is frustrating when you clearly discussed
"the LKQ integration project" and Pip creates a new task instead of updating the
existing one.

**What changed:**

1. **Tap to mark discussed (Part A).** During a meeting in the full-screen meeting
   mode, you can tap any project card or open-item row in the sidebar to flag it
   as "discussed this meeting." Flagged cards show a teal ✦ Discussed chip and a
   teal left border. When you hit End & Summarize, those flagged IDs are sent to
   Pip as a high-confidence signal — Pip strongly prefers updating or closing
   flagged items rather than creating new ones.

2. **Live note highlight (Part B).** As you type your meeting notes, the sidebar
   automatically detects when you've written a project or item title in the notes
   and highlights the matching card with a subtle teal glow. This gives you instant
   visual confirmation that Pip will connect the dots — before you even hit
   summarize. No tapping required for the auto-detection.

3. **Plan modal badge.** In the summarize-preview modal, any row that Pip derived
   from a flagged project or item shows a ✦ Discussed badge so you can see Pip
   acted on your signal.

**What you see today:** In meeting mode, sidebar project cards now have a small
"◇ Mark discussed" button in the top-right corner. Tap it and it turns to
"✦ Discussed" in teal. Open-item rows are tappable directly to toggle the same
flag. As you write notes, any card whose name appears in your text gets a soft
teal glow. When you summarize, Pip's plan modal shows ✦ Discussed badges on the
rows that connect to things you flagged.

**Why it matters:** This directly fixes the user's #1 complaint. When Pip knows
what you discussed, it stops creating duplicates and starts doing what you actually
want — updating the right project, closing the resolved item, and routing the work
correctly. The signal is explicit (you tapped it) so Pip gets the highest possible
confidence, not a guess.

---

## 2026-06-03 — Pip drip questions (Phase 2)

**What I built:** After the Phase 1 onboarding interview, Pip now keeps learning through a gentle weekly drip. A "Pip's Curious" card appears on your Home screen with one question at a time — you type your answer inline, hit Answer, and Pip files it away. No modal, no interruption.

**The problem it solves:** The 5-question interview gave Pip a solid foundation, but a real relationship develops over time. Contacts gain roles, accounts get objectives, and your company builds up its own vocabulary of brands, programs, and codenames that no onboarding script could anticipate. Phase 2 is how Pip catches up to your real world without asking you to fill out a form.

**What changed:**

- **Daily gap detection (`detectKnowledgeGaps`)** — runs once per calendar day, zero LLM cost. Scans your data for three structural holes: contacts who appear in ≥3 meetings with no role on file, active accounts older than 30 days with no objective, and empty profile slots (if onboarding is marked done). Inserts `folio_pip_questions` rows (`source='gap_observed'`) for each gap found, templated from real names and account data.
- **Evergreen question bank** — 15 get-to-know-you questions (what a great week looks like, what metric you're judged on, which account keeps you up at night, etc.). Seeds only when the gap detector comes up empty, so the drip never stops.
- **Throttle (DB-driven, cross-device)** — max 1 per day, max 3 per rolling 7 days, 48h cooldown after any skip or dismiss. All persisted in `folio_pip_questions.answered_at` so it follows you across devices.
- **HomeView "Pip's Curious" card** — appears between the Daily Brief and the four-panel grid. Inline textarea (16px, no zoom), Answer / Skip / Not now buttons. Disappears when answered.
- **Terminology scan (`api/detect-terminology.js`)** — one Haiku call per week. Scans the last 30 meeting notes for proper nouns appearing ≥3 times that aren't a known account, contact, or glossary entry. Creates `category='terminology'` drip questions. When you answer, the answer writes to `folio_pip_facts` automatically.
- **Re-synthesis trigger** — when you've answered ≥3 drip questions since the last synthesis, a background call to `/api/profile-synthesis` updates your profile prose.
- **Settings → "Pip's Questions"** — global pause toggle and a 0–100% completeness progress bar.

**What you see today:** On home load, if Pip has a gap question queued and the throttle allows it, the "Pip's Curious" card appears. Answer it, skip it, or dismiss it. Over the first few weeks, Pip builds up your company's vocabulary and fills in missing data — silently, from data it already sees.

**Why it matters:** A good analyst doesn't interview you once and coast. Phase 2 is what turns Pip from a static profile into a system that gets smarter the longer you use it.

---

## 2026-06-01 — Pip onboarding interview + profile prose injection (Phase 1)

**What I built:** When you first sign in to Folios with no accounts yet, Pip now
walks you through a short 5-question interview to learn who you are and how your
business works. Your answers get synthesized into a short profile narrative that
Pip reads before every response — briefings, meeting summaries, chat answers —
so everything Pip says is grounded in your actual world, not generic advice.

**The problem it solves:** Pip is only as useful as the context it has. Without
knowing your role, your company, how many accounts you carry, or what a good
quarter looks like for you, Pip's outputs were technically correct but sometimes
oddly generic. Now Pip knows the basics from the start.

**What changed:**
- Two new tables: `folio_user_profile` (one row per user, stores structured
  profile fields and a 4–8 sentence `profile_prose` narrative) and
  `folio_pip_questions` (the question queue and answer log). Both have RLS
  scoped to your user ID. SQL: `supabase/folio_user_profile.sql`.
- New full-page `PipOnboardingView`: 5 questions, one at a time, in Pip's voice.
  Resumable — if you close and come back, Pip picks up where you left off.
  Skippable at any point via "Finish later".
- New `/api/profile-synthesis` endpoint: takes your Q&A pairs, runs a single
  cheap Haiku call (~$0.002 once), and compresses them into a structured profile
  + a narrative paragraph that Pip reads going forward.
- New `useUserProfile` hook — reads and writes your profile row.
- `profile_prose` injected into both Pip entrypoints: meeting summarize
  (`pip.js`) and Ask Pip chat (`api/pip.js`). Both paths now prepend a
  "WHO YOU ARE" block to Pip's context so the same grounding applies everywhere.

**What you see today:** New users (no accounts) are routed directly to the
interview screen on first login. Existing users (who already have accounts when
this shipped) see a dismissible "Pip · Just for you" card on the Home screen
with "Let's go →" and "Maybe later" options. The interview is soft-gated — you
can always skip or finish later, and Pip still works fine without it.

**Why it matters:** This is the foundation for everything else in the "Pip knows
my world" roadmap. Once Pip knows who you are, every brief, summary, and
suggestion can be grounded in your specific role, industry, portfolio shape, and
goals rather than generic account management advice. Phase 2 (the gentle weekly
drip of gap-filling questions) builds on this base.

---

## 2026-05-31 — Gauge template total turnaround time

**What I built:** Templates in Gauge now carry an "Estimated Duration"
field that tells you upfront how long a project type typically takes.
When you create a project from a template, Gauge automatically sets an
expected completion date so you always know roughly when the work should
wrap.

**The problem it solves:** Until now, templates were a list of tasks
with no sense of time. You'd pick a template and have no idea if it
represented a 2-day task or a 6-week project. The expected completion
date also gives Pip something concrete to flag — it can surface projects
approaching or past their estimated finish.

**What changed:**
- Templates have a `total_duration_days` field. The TemplatePickerModal
  shows "Est. Xd" next to each template name when it's set.
- Templates with stage `due_offset_days` values auto-derive the duration
  as a placeholder (max offset across all stages). Manual override wins.
- When you create a project from a template with a known duration,
  `expected_complete_date` = today + duration days is set automatically.
- Project cards show the expected complete date in the meta row.
  Past-due expected dates show in amber so they're easy to spot.

**What you see today:** The "Est. Xd" chip on templates in the picker,
and an "Est. complete · [date]" line on project cards built from
timed templates.

**Why it matters:** Gives Chris an instant sanity check when picking a
template ("this is normally a 14-day project") and surfaces an early
warning when work is running long.

---

## 2026-05-30 — Gauge V3 Phase 6: polish + V2 brain wiring

**What I built:** Four cleanup items that tie the whole Gauge V3 build
together and finish wiring Pip's learning loop into every Gauge
surface that touches a task.

**The problem it solves:** Phases 1–5 left a few corners loose: edits
made directly in the project stage editor or the kanban board weren't
feeding Pip's correction log, the wrong-account-from-Pip case had no
fix path after the plan had already been applied, AMs had no place
on the home page to see "my projects" at a glance, and assignment
hints only applied per-account so Pip couldn't generalize "Sara owns
invoice work" across the org.

**What changed:**
- Corrections wiring — task-text edits made through the project
  stage editor, the standing-projects kanban, or the My Queue panel
  now all log to Pip's correction log the same way edits through the
  task detail panel always did. The V2 brain learning loop is now
  closed on every Gauge entry point.
- Post-apply account override — if Pip routes a task to the wrong
  account and you only notice after the fact, you can change the
  Linked Account field on the task and Pip logs that as a
  `routed_account_changed` correction so it learns the right home
  for next time.
- "Projects I own" rollup on Gauge home — for AM-lens users, a
  compact section appears above the stats row showing every active
  project on accounts they own (progress bars, status pills, account
  chips). Click any row to scroll to it in the list below.
- Org-wide assignment hints auto-promotion — once 3 different
  accounts have logged the same kind of work going to the same
  person (e.g. invoice tasks → Sara), the system promotes that into
  a cross-account hint so Pip routes future invoice work to Sara on
  any account, not just the three she's been doing it on.

**What you see today:** Same Gauge layout, but Pip is now learning
from every edit and the AM view has a cleaner home rollup. The
assignment-hint promotion is silent — you just notice over time that
Pip starts routing the right work to the right person without you
having to correct him every time.

**Why it matters:** This closes out Gauge V3. The V2 brain is now
fully wired through Gauge (Phases 5 + 6 together), and the system
is set up to actually get smarter the longer you use it.

---

## 2026-05-30 — Gauge V3 Phase 5: Leader view

**What I built:** The org-wide project rollup that the Leader lens
has been waiting for, plus a read-only drill-in to see what any
teammate has on their plate.

**The problem it solves:** Leaders need a view that's about *the
team*, not their personal queue. Until today, leaders were looking
at the same AM-focused project list as everyone else — useful for
their own work, useless for spotting that Tony's been stuck on the
KSI Salvage audit for 12 days.

**What changed:**
- New "Leader" tab in Gauge (only visible to users whose default
  view is Leader). Lists every project across every AM and account,
  hiding drafts and completed work.
- Each row shows: title, status, account chip, AM chip, progress
  (X/Y stages, percent), due date, and a "STUCK · Nd" pill that
  lights up when no stage has been completed in 7+ days. Expanding
  a row shows every stage with its assignee and due date inline.
- Filter bar: by AM, by account, by status, by stuck-only.
  Sort by due date, progress, or stuck-time. "Clear" resets all.
- Clicking an AM chip drills into a read-only view of that teammate
  — their open tasks, project stages assigned to them, projects
  they're on, and the accounts they touch. No edit buttons; the
  point is visibility, not mutation.
- Open-project button on each expanded row jumps over to the
  standard Projects view with that project's row pre-expanded.

**What you see today:** If your default view is Leader (set on the
team-member record), Gauge opens straight to the Leader rollup.
Everyone else still lands on Projects or Tasks. Toggle in the
top-left switches between Leader / Projects / Tasks.

**Why it matters:** This is the team-rollup story the Leader lens
from Phase 2 was setting up. Pip's tone already adapts per lens;
now there's a real UI to match. The drill-in pattern also lays
groundwork for org-wide hints in Phase 6 — once you can see what
Sara owns, the system can start routing similar work to her.

---

## 2026-05-30 — Gauge V3 Phase 4: discrete project templates

**What I built:** Save any project as a template, then spin up new
projects from it in one click — with assignees pre-filled and due
dates auto-scheduled relative to the day you create the new project.

**The problem it solves:** Discrete projects like audits or onboardings
have the same stages every time — same people, same approximate
durations. Today you'd re-type all 7 stages every time. Templates
remove that drudgery.

**What changed:**
- "Save as template" button at the bottom of the project modal now
  preserves each stage's assignee email and a "due offset days" value
  (how many days after kickoff each stage is due).
- "+ From Template" picker (already in Gauge) now hydrates due dates
  when you use a template — every stage gets a due_date computed from
  today + the saved offset. Assignees pre-fill from the saved emails.
- Sub-stages get the same treatment.

**What you see today:** Saving a project as a template now actually
captures the structure people use — who does what, when. Using a
template puts a fully populated project on the table ready to tweak,
not a blank skeleton.

**Why it matters:** Templates were partially built earlier (the table
+ basic picker existed) but never carried the data that made them
worth using. Now they do. AMs running repeat workflows save real time.

---

## 2026-05-30 — Gauge V3 Phase 3: flat task queue

**What I built:** The new flat task queue — every task and action item
across every account and project in one scannable list. Toggle between
Projects and Tasks at the top of Gauge.

**The problem it solves:** Before today you could see projects, but you
couldn't see "everything on my plate right now" without bouncing
between accounts. Tasks lived inside projects, which were inside
accounts, which were inside workspaces. Too many layers of indirection
for the simple question "what am I supposed to do?"

**What changed:**
- New "Tasks" tab at the top of Gauge, alongside "Projects." Renders a
  flat queue of every task and item, sorted by due date.
- Cards show the task title big, with account chip + project chip +
  due date underneath. Discrete projects get a "Step 3 of 7" badge so
  admins know where they are in the larger thing.
- Three sub-filters: Open (default), Mine (filters to tasks assigned
  to you), All (everything).
- "Group by project" toggle clusters tasks by their parent project.
- Admin lens lands directly on Tasks tab by default. AM and Leader land
  on Projects (current behavior preserved).
- A one-time SQL backfill brings existing items and project stages
  into the new unified table so the queue isn't empty on first load.

**What you see today:** A Projects | Tasks toggle at the top of Gauge.
Click Tasks to see the new flat queue. Pip's plan-apply path has been
dual-writing since this morning, so newly-created tasks land
immediately; existing tasks land after running the backfill SQL.

**Why it matters:** This is the first user-facing surface of Gauge V3.
The lens system from Phase 2 quietly defaults Admin users to the
queue. Phases 4-6 add project templates, the Leader rollup, and the
polish layer that ties the system together.

---

## 2026-05-30 — Gauge desktop polish: capped list + insights sidebar

**What I built:** Capped the desktop project list width so cards stay
scannable, and put a "Pip + insights" panel in the right margin so the
empty space turns into a steering wheel.

**The problem it solves:** On a wide monitor, project cards stretched
edge-to-edge. Your eye had to scan from left to right to read one row —
the same content felt harder to read than on mobile, where the narrow
cards stacked cleanly.

**What changed:**
- Project list is now capped at 720px wide on desktop, single column,
  left-aligned. Matches the cohesive feel of the mobile view.
- Right sidebar (desktop only) shows three blocks: Pip's notice
  (moved from above the list), a "Stuck" list of in-progress
  projects whose updated_at is more than 7 days old, and a "Team
  load" tally of who has the most open task items across all live
  projects.
- Mobile view is unchanged.

**What you see today:** A cleaner, narrower project list on desktop
with a steady sidebar to the right showing what's stuck and who's
loaded up. Numbers and names are derived live — no new data to
maintain.

**Why it matters:** Same data, way easier to scan. The same pattern
(capped content column + sidebar of derived insights) will land on
Accounts and other list views over time. Phase 3 of Gauge V3 (the
real flat task queue) will inherit this layout instead of relearning
it later.

---

## 2026-05-30 — Gauge V3 Phase 2: lens system

**What I built:** The plumbing for the three role-based views Folios
will use going forward — **AM**, **Leader**, and **Admin**. Each
member of a team now has a default view assigned at invite time.

**The problem it solves:** Different people in the org care about
different things. An account manager wants to see *their accounts*.
A leader wants to see *what the team is up to*. An admin wants to
see *what they need to finish*. One UI showing all three at once
would be cluttered for everyone.

**What changed:**
- New `default_lens` column on team members in the database (AM /
  leader / admin). Existing members were backfilled — owners and
  admins got Leader, everyone else got AM.
- The invite modal now has a "Default view" dropdown next to role.
  It smart-prefills based on the role you pick (Leadership → Leader,
  Member → AM) but you can override.
- Pip now knows what view each user lives in and frames his answers
  accordingly — strategic team rollup for Leaders, account-focused
  for AMs, execution-mode for Admins. Same Pip personality, different
  altitude.

**What you see today:** A "Default view" dropdown when you invite a
new team member. Pip's answers in chat already feel slightly
different per lens. No new UI surfaces yet for Leader or Admin views
— those land in Phases 3-5.

**Why it matters:** Pip's tone now adapts to who's asking, which is
the first real lens-aware behavior in the product. Phase 3 builds
the actual queue UI; Phase 5 builds the Leader rollup. Phase 2 is
the data foundation that makes both possible.

---

## 2026-05-30 — Gauge V3 Phase 1: unified task home

**What I built:** A single new database table called `folio_tasks` that
will eventually hold every task and action item in Folios.

**The problem it solves:** Before today, your tasks lived in two
different places. Loose action items went into one table; tasks tied
to projects went into a different one (nested inside the project
itself). Pip had to guess which bucket to use, and you couldn't see
all your work in one queue. The plumbing was fundamentally split.

**What changed:** New unified `folio_tasks` table exists in
production. Pip now writes to both the old places (so nothing breaks
for you today) AND the new unified place (so the new queue UI has
real data to read from when it lands).

**What you see today:** Nothing. This was pure plumbing — no UI
changes. But every Pip plan you Apply going forward is silently
populating the new table.

**Why it matters:** This is the foundation for the three-lens views
(AM / Leader / Admin) and the flat task queue coming in Phases 2-6.
Without one home for tasks, none of that could exist.

---

---

## 2026-05-31 — Pip Tier A: portfolio intelligence + daily brief

**What I built:** Pip can now see your whole portfolio at once. Every
morning it takes a snapshot of every account's health — how cold each
one is, how many items are overdue, which projects are moving and
which are stuck — and then writes you a plain-English brief on the
home screen.

**The problem it solves:** Before today Pip only knew about one
account at a time. If you opened ACME's cadence hub, Pip knew
everything about ACME. But it had no idea that Parts Authority was
45 days cold, or that three accounts had overdue items piling up.
You had to hold the full picture in your head. Pip now holds it for
you.

**What changed:**
- New `folio_account_snapshots` database table. One row per account
  per day, computed from real signals: health status, days since last
  contact, open/overdue item counts, active/stuck Gauge project
  counts. Zero AI cost — pure arithmetic.
- Snapshots are computed once per calendar day on app load, silently,
  in the background. They never block the UI.
- Daily brief card on the home screen. One Haiku call, cached for
  the whole day (not re-run until tomorrow). Pip reads the snapshot
  table and writes a 3-5 sentence morning read: what needs attention,
  biggest risk, any wins worth noting.
- `buildPortfolioState()` utility that compresses the portfolio into a
  short text block — the building block for the 1:1 mode and boss-ready
  rollup coming in Tiers B-D.

**What you see today:** A "Pip · Daily Brief" card at the top of the
home screen, just above the four panels. It loads a few seconds after
the home screen appears (while Pip is thinking). The next day it shows
instantly from cache. If there are no snapshots yet (first app load
after this upgrade), the card stays hidden.

**Why it matters:** This is the Tier A foundation for Pip's "chief of
staff" mode. Every more sophisticated portfolio feature — people
modeling, pattern detection, proactive briefings for your boss — runs
on top of these daily snapshots. The snapshots are free to compute and
cheap to query. The brief costs roughly $0.07/month at Haiku pricing.

---

## Earlier upgrades

Pre-2026-05-30 upgrades happened before this log existed. They're
captured in [changelog.md](./changelog.md) and the
"Already shipped" section in CLAUDE.md (internal working doc).
Going forward, every major upgrade lands here in plain English.
