# Folios — Changelog

*Last updated: 2026-05-30*

Notable releases and capability shipments. Reverse chronological.

For the day-to-day commit history, see git log on the production
branch.

---

## May 2026

### V2 brain — Pip learning loop foundation
The intelligence layer that makes Folios different.

- `pip_correction_log` table with 6 correction types (summary_edit,
  rejected_row, item_text_edit, task_text_edit, missed_item,
  routed_account_changed)
- Compression pass distills correction log into per-account
  `pip_account_state.lessons_learned` paragraphs
- Archive table for older corrections
- Read-back of last 10 corrections per summarize call
- `pip_glossary` table for user-taught vocabulary
- Cross-account routing via `target_account_id` on plan rows
- Internal-meeting prior (when account_type is internal_team)
- Source backref (`source_meeting_id` on `folio_items`) — every
  Pip-created item links back to the meeting that produced it
- `pip_created_at` marker so the V2 brain detects post-creation edits

### Pip — cost optimization push
Reducing API costs as feature surface grew.

- 4-breakpoint stacked prompt caching (system / glossary / roster /
  items+tasks)
- ~70% cache hit rate on multi-call sessions
- Trivial-draft short-circuit: drafts <100 chars never call the API
- Lessons-learned preference (read distilled paragraph instead of
  raw corrections when fresh enough)
- Per-call telemetry to `folio_pip_usage` with cache-tokens visibility
- `max_tokens` bumped to 3072 for summary mode to prevent
  mid-JSON truncation on long meetings

### Pip — summarize-preview modal polish
Making the human-approval gate clearer and more powerful.

- Custom visible checkboxes (replaced near-invisible native input)
- Inline-editable row titles (fix wording before applying)
- "See source" expander per row (shows the slice of notes that
  triggered the row; editable to feed back as correction reason)
- Side-by-side current vs. proposed diff for update-item rows
- Cancel confirmation (auto-skip if no edits made)
- "+ Add missed item" affordance for things Pip didn't catch
- TargetAccountChip per row for cross-account routing override

### Pip — visual upgrades
Pip now feels alive.

- Idle: gentle breathing animation
- Thinking: yellow tint + faster pulse during any Pip API call
- Speaking: bobbing head/tail dots while streaming a response
- Alert: red tint when there's an unresolved error
- State broadcast via PipStateProvider; every PipOrb on the page
  reflects the same mood
- Respects `prefers-reduced-motion`

### Gauge — Past Due stats tile
Stats grid now shows in-progress projects with overdue due dates.
Click to filter the list to just those projects.

### Diagnostics — Copy-all button
Expanded error rows now have a one-click "Copy all" button that
bundles type, time, URL, message, stack, and context into a
clipboard payload for sending to support.

### Auto-recover stale-chunk Lazy import failures
Post-deploy edge case where the browser tries to import HTML as JS
now detected in three error surfaces (window.onerror,
unhandledrejection, ErrorBoundary). Triggers immediate reload
instead of waiting for the 3-min version poll. Marked
auto-resolved so they don't clutter Diagnostics.

### Mobile layout polish
- Floating Pip orb hidden on home view (centerpiece orb is already
  Pip)
- Touchpoint/Task pill bar restored to full width
- Bottom nav tabs equal-weighted with 2px top-border indicator
- Workspaces chevron now inline with label

### Documentation suite
Presentation-ready docs at `docs/`: one-pager, product overview,
security, data handling, architecture, AI governance, reliability,
roadmap, changelog. Discipline rule added to CLAUDE.md ensures docs
stay in sync with capability changes.

### Light theme
Full design-system translation supporting light mode alongside dark.
Token swap via CSS custom properties; pre-mount script prevents
flash-of-wrong-theme. Settings → Appearance toggle.

### Inactive / archive + account merge
No hard deletes. Inactive flag is reversible. Merge flow for
acquisitions re-parents all child rows to the target account
atomically.

### Workspaces — Departments + Partners
`account_type` extended to `'internal_team'` and `'partner'`
alongside the existing types. Conditional UI per type; same
underlying model.

### Account owners + Mine filter
Per-account ownership via `owner_user_id`. Owner-initial chip on
account headers. "Mine" filter on workspace lists.

### Activity audit trail
Per-user activity feed in Settings. Owner-role users see org-wide;
non-owner users see their own actions.

### Cadence Hub V2
Pre-call command center experience. Pip brief, big "Start Meeting"
CTA, inline-expanding Gauge project cards, open items, follow-ups,
widened history with CADENCE/AD-HOC tags. Start Meeting opens
full-screen `CadenceMeetingMode`.

### Unified Log Conversation flow
Ad-hoc conversations now use the same full-screen meeting mode as
cadence meetings. `StartConversationModal` with searchable account
picker. End & Summarize routes through the same PipSummarizePreview
plan flow.

### Revenue-impact Update Calendar V1
Manual change-event log per account with categories, owners, and
observed impact tracking. New "Updates" tab on AccountDetail.

### Folios design system refresh
Unified Mark component with animated glyphs per nav section. LitPill
component for desktop rail CTAs. Mist background tokens for sidebar.
Tier-tinted stat-tile halos. Inline-style consolidation onto C
tokens.

### Cadence meeting reminders
`useCadenceReminders` hook fires reminders at 30m/5m/start
thresholds. In-app banners + optional browser notifications. Start-
tone CTA auto-opens meeting mode.

### Gauge — Standing Projects + Custom Columns + Admin Queue
Gauge gained two project models: discrete (linear, AM-owned) and
standing (kanban, admin-owned reactive queue). Custom field schema
per project. Unified TaskDetailPanel. MyQueueView for personal
queues.

### Multi-phase hardening pass
8-phase production hardening: RLS holes patched, Pip prompt-injection
guards, autosave-failure backups, fetch timeouts and retries,
ErrorBoundary at App + per-Suspense, observability stack, accessibility
audit, multi-device realtime sync.

### Pip cost telemetry
`folio_pip_usage` table tracking per-call tokens and mode. User-
facing cost dashboard in Settings.

### Sub-accounts (parent-child)
`parent_account_id` on accounts. MSO accounts hold child shops;
parent customers hold child divisions. Nested display in lists.

### Pip Voice Chat
Mic button for input (Web Speech API). Speaker toggle for output
(SpeechSynthesis). Silence auto-send. Premium TTS planned for
later.

---

## Earlier (2025-2026 pre-launch)

### Initial production launch — May 2026
Folios goes live at folioshq.com with:
- Accounts, contacts, meetings, items, cadences
- Pip V1 (meeting summarize, brief me, ask)
- Gauge V1 (project stages, request-from-Folios, multi-assignee)
- PWA with offline shell
- Supabase Auth with RLS
- Two-theme support
- Mobile-first responsive layout

### Migration from Lanyard
11 ABPA 2026 partner accounts and 8 meetings imported from Lanyard
with Pip summaries and draft emails attached. Validates the
cross-product data-flow story.

---

## Conventions

- **Notable** means user-visible or architectural. Bug fixes and
  refactors aren't in here unless they changed a documented
  capability.
- **Reverse chronological** within each month — most recent first.
- **Future versioning** will adopt semantic version tags
  (v0.1.0, v0.2.0, etc.) once the multi-user phase begins. Until
  then, "May 2026" granularity is the unit.

---

## Contact

chris.vasconcellos97@gmail.com
