# Folios — Upgrade Log

*Last updated: 2026-05-30*

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
