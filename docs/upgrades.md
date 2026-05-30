# Folios — Upgrade Log

*Last updated: 2026-05-30 (Gauge V3 Phase 2 — lens system)*

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

## 2026-05-30, late evening — Gauge V3 Phase 2: lens system

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

## 2026-05-30, evening — Gauge V3 Phase 1: unified task home

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

## Earlier upgrades

Pre-2026-05-30 upgrades happened before this log existed. They're
captured in [changelog.md](./changelog.md) and the
"Already shipped" section in CLAUDE.md (internal working doc).
Going forward, every major upgrade lands here in plain English.
