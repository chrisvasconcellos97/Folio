# Folios

*Last updated: 2026-05-30*

## What it is

Folios is a year-round relationship-management workspace for people who
manage external accounts at scale. Account managers, partner managers,
field reps — anyone whose job is keeping a portfolio of relationships
healthy, prepared, and accountable.

Think of it as the **external brain for an account manager**: every
meeting note, every cadence, every promised deliverable, every
relationship pattern — captured once, recalled when it matters.

## The differentiator: Pip

Pip is the AI field analyst embedded in Folios. Pip doesn't just
summarize meetings — Pip *learns*. Every correction the user makes
(reassigning a task, fixing an account name, declining a proposed
action) feeds a learning loop that makes the next meeting summary
sharper. After a few weeks of use, Pip knows who handles what on each
account, which legacy names map to which current accounts, and what
the user typically wants to action vs. ignore.

This isn't ChatGPT bolted onto a CRM. The intelligence accumulates
inside the user's own data and stays there.

## Who it's for

- **Account managers** running portfolios of 20-100 customer accounts
- **Partner managers** tracking long-cycle B2B relationships
- **Field teams** with recurring cadences (calls, visits, check-ins)

## Status

- **Live in production** at folioshq.com (May 2026)
- **Single-user pilot** — used daily by the founder for a real OEC
  account portfolio
- **Built on SOC2-aligned infrastructure** (Supabase, Vercel, Anthropic)
- **Multi-tenancy ready** — org-and-role architecture in place from day 1

## What Folios does today

- **Accounts, Departments, Partners** — three workspace types, one
  unified model
- **Cadences** — recurring meeting schedules with auto-advancing next-due
- **Cadence Hub** — pre-call command center with Pip brief, open items,
  follow-ups
- **Full-screen meeting mode** — distraction-free notepad with
  Pip-summarize-on-exit
- **Pip** — meeting summarize, brief-me, ask-anything, voice in/out, V2
  learning brain
- **Gauge** — project & task management with discrete + standing project
  models
- **Update Calendar** — track catalog/pricing/integration changes to
  cross-reference revenue dips
- **Inactive & merge** — no hard deletes; accounts can be merged after
  acquisitions
- **Light + dark themes** — full design system supporting both
- **Mobile-first PWA** — installable on phone, full offline shell

## The architecture

Folios is the umbrella. Two connected modules live within:

- **Lanyard** — conference-specific module (schedule, partners, team chat).
  Punches out from Folios during conferences, feeds notes back.
- **Gauge** — project management module. Tracks commitments from
  meetings into trackable projects.

All three share a single Supabase backend, a single auth identity, and
a single Pip personality.

## Why this exists

External relationship management is everyone's most important
unstructured-data problem. Today people solve it by:

- **CRMs** (Salesforce, HubSpot) — built for sales pipeline, not
  relationship continuity. AMs use them under protest.
- **Note apps** (Notion, Apple Notes) — capture but don't connect. No
  cadence, no Pip, no portfolio view.
- **Conference apps** (Brella, Whova) — die when the conference ends.

Folios is the layer that survives the conference, accumulates over
years, and gets smarter as it goes.

## Contact

chris.vasconcellos97@gmail.com
