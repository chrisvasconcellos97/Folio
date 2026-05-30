# Folios — Roadmap

*Last updated: 2026-05-30*

This is the public-facing roadmap. For the internal day-to-day queue,
see CLAUDE.md → Pending Updates. This file is the version that goes
to stakeholders, sponsors, and prospective users.

---

## Today (shipped, live)

**Status: in production at folioshq.com since May 2026. Single-user
pilot.**

Folios is feature-complete enough to be the daily-driver
relationship-management tool for one user managing 50+ accounts. The
shipped capabilities below all work in production today.

### Account management
- Accounts, Departments, Partners workspace types with conditional UI
- Sub-accounts via parent-child relationship
- Inactive / merge workflow (no hard deletes for accounts)
- Tier-aware health computation
- Custom account context (Quick Notes) read by Pip

### Cadences & meetings
- Recurring meeting schedules per account
- Cadence Hub (pre-call command center)
- Full-screen distraction-free meeting mode
- Auto-advance cadence on conversation log
- 30m / 5m / start meeting reminders (in-app + browser notification)
- Ad-hoc conversation logging

### Pip (the V1 + V2 brain)
- Meeting summarize with structured plan (review-before-apply)
- Brief Me (pre-call brief, cached per account)
- Ask Pip (conversational chat with full account context)
- Voice in (browser Web Speech API)
- Voice out (browser SpeechSynthesis; premium TTS planned)
- Correction log → learning loop
- Glossary → user-taught vocabulary
- Lessons learned → distilled per-account memory
- Cross-account routing
- Org-wide assignment hint patterns

### Gauge (projects & tasks)
- Discrete project model (multi-step, finish-line)
- Standing project model (kanban, reactive queue)
- Custom field schemas per project
- My Queue view (flat task list across projects)
- Standing board view (kanban inside project row)
- Project drafts (save-without-publishing)

### Quick Tasks tray
- Floating fast-capture interface
- 2-second log without leaving current screen

### Update Calendar
- Manual change-event log per account (catalog, pricing,
  integration, etc.)
- Owner + observed impact tracking
- Recent updates surface on account overview

### Team & multi-tenancy
- Org-and-role architecture (`folio_orgs`, `folio_org_members`)
- Owner / admin / member roles
- Invite & revoke flow
- Activity audit log
- Leadership view (read-only portfolio dashboard)

### Design system
- Dark + light themes with full token coverage
- Animated mark glyphs per nav section
- Pip mood state (breathing / thinking / talking / alert)
- Mobile-first PWA with offline shell
- Self-hosted fonts (no Google Fonts CDN dependency)

### Observability
- Error capture to `folio_errors`
- Per-user diagnostics view with Copy-all for support
- Auto-recovery of stale-chunk Lazy import failures
- Pip usage telemetry (`folio_pip_usage`)

### Security & data integrity
- Row-Level Security on every user-data table
- Optional MFA via Supabase TOTP
- 60-min session timeout
- 20 req/min rate limit on Pip
- Per-account JSON export

---

## Next up (in flight or queued)

### Gauge V3 — three role-based lenses + unified task model
**Status:** Spec'd. Queued for next major build.

Reshape Gauge around a single task table (`folio_tasks`) and three
role-based default views set at invite time:
- **AM view** — account-centric, current experience
- **Leader view** — team rollup, who's stuck, what's overdue
- **Admin view** — flat task queue, due dates, account chips

Same UI shape across all three; Pip's prompt branches per role.
Items and Gauge tasks merge into one table. Discrete project
templates. Cross-account routing canonical homes. Post-apply
account override. Org-wide assignment hints (already partially
shipped).

Full spec in CLAUDE.md → Pending Updates → section 14.

### Premium voice for Pip
**Status:** Wishlist. Vendor selection pending.

Replace browser SpeechSynthesis (poor quality) with OpenAI TTS,
Cartesia, or ElevenLabs. Cost is negligible at solo-user volume
(~$2-5/month). Implementation is ~1 hour after vendor selection.

### Pip's weekly clarifying questions
**Status:** Spec'd. Depends on more correction-log data first.

After a few weeks of corrections, Pip surfaces a tile asking
clarifying questions based on observed ambiguity ("you reassigned 3
invoice tasks from Tony to Sara — should I always route invoice work
to Sara on KSI?"). Closes the loop on the V2 brain.

### Active session management
**Status:** Not yet built. Multi-user readiness item.

UI to view / revoke active sessions across devices.

### Public-facing changelog
**Status:** This file's sibling, [changelog.md](./changelog.md),
shipped today. Will be expanded with version tags as the product
matures.

---

## Strategic horizons

### Multi-user team rollout
**When:** After single-user pilot validates daily-use stickiness
(currently in month 1 of pilot).

**What changes:**
- Team mode UI surfaces (member directory, role management)
- Penetration test (engaged before any paid customer)
- Active session management UI
- Documented incident-response playbook
- PagerDuty / on-call alerting integration
- Multi-reviewer code-review process
- Load testing
- Service-level SOC 2 audit consideration

### Lanyard real auth + Folios ↔ Lanyard live sync
**When:** Top priority for the next Lanyard build cycle.

Today Lanyard uses anonymous user IDs in localStorage. Real Supabase
Auth would let conference notes flow into Folios automatically as
they're captured. This makes the "year-round relationship continuity"
story live and demonstrable instead of architectural.

### CRM integrations
**When:** When a real customer or sponsor requests it. Built on
demand, not speculatively.

Salesforce / HubSpot bidirectional sync. Likely starts with one-way
read (Folios pulls context from CRM) and grows to bidirectional.

### Gauge Phase 2 — cross-functional PM tool
**When:** After Gauge V3 lands and gets real usage.

Expand Gauge from "AM-facing project tracker" to a full PM tool used
by product / ops teams. AMs linked to relevant projects, PMs manage
work directly. Get input from OEC product team and PMs before
building.

### Cadence analytics
**When:** Once enough historical data exists to make it meaningful
(currently insufficient at single-user pilot).

Meeting frequency per account, open item age trends, account-health
shifts over time, automatic flagging of cold accounts.

### Revenue-impact Update Calendar V3
**When:** Deferred. Pending real customer-data integration
possibility.

Today's V1 is manual-entry. V3 would add auto-ingestion via webhooks,
portal scraping, or email parsers. Big lift; revisit when V1 has
enough data to prove the value.

---

## Explicitly NOT on the roadmap

Some things are intentional non-features:

- **Email integration** — no inbox sync, no auto-log from email
  threads. Pip operates on notes the user explicitly captures.
  Reason: scope discipline. Email-driven AM tools exist; that's not
  the wedge.
- **Auto-transcription from a Zoom feed** — meeting notes are
  user-typed or voice-dictated. Reason: privacy + cost + transcript
  quality vs. human-curated notes for context.
- **Salesforce parity** — Folios is not a CRM. The pipeline/quote/
  opportunity-management workflow is deliberately excluded.
- **Slack-style chat / DMs across teams** — out of scope for an
  account-management tool. (Lanyard has team chat scoped to
  conferences.)
- **Visualizations / BI** — Folios is a working surface, not a
  dashboard. BI tools connect to the Supabase backend directly via
  the Postgres connection string when needed.

---

## How to influence the roadmap

This is a single-developer pilot today. The roadmap reflects:
1. What the founder/daily-user is hitting friction on
2. What's high-leverage for the V2 brain story
3. What's needed for multi-user readiness when team mode lights up

For external input: chris.vasconcellos97@gmail.com.

---

## Contact

chris.vasconcellos97@gmail.com
