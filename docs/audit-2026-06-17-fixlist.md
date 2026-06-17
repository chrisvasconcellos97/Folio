# Folios Audit — MASTER FIX LIST (working tracker)

Source: `docs/audit-2026-06-17.md`. Every unfixed finding, grouped by type.
Tags: **S**=one-liner · **M**=single-file · **L**=cross-file/structural. Sev P0–P3.
Already done (not here): Pill token, QuickActionBar 16px, useFolioHealth label, PipOrb3D comment, /gauge/ delete, home-hub fictionalize.

Check off `[x]` as we go. Work order suggestion: §1 → §2 → §3 → §4 → §5 → §6 → §7 → §8 → §9 → §10.

---

## §1 — CORRECTNESS BUGS (wrong data / crashes / silent failures)

- [x] (S,P0) `StandingBoardView.jsx:48-56` — commitTask now calls shared autoStatusPatch (mirrors commitStages). NOTE: autoStatusPatch returns null for is_standing projects (by design — ongoing boards don't auto-complete), but GaugeView:231 heal flips standing→complete with no isStanding guard → inconsistent. Left as-is; needs Chris's call on whether standing projects should ever auto-complete.
- [x] leadership-readout: payload-processing now inside try-catch.  - [ ] (M,P0) `api/portfolio-brief.js:47-293` — STILL TODO: main logic outside try-catch (250-line wrap, do carefully).
- [x] (S,P0) `api/ask-pip.js` — added `export const config = { maxDuration: 60 }` → 10s default kills 12-20s meeting Haiku → "Ask Pip on meeting" silently network-errors.
- [x] (M,P0) `cadenceUtils.js:65-83` — biweekly null-anchor NaN guard added (falls back to `from`).
- [ ] (S,P1) `useItems.js:38` — `.eq("done",false)` → ItemsTab "Closed" section permanently empty (completed tasks vanish). Parameterize / 2nd query on expand.
- [x] (S,P1) `CommitmentsView.jsx:95` — now passes `acct.id` (was full OBJECT) vs HomeView's `(account.id)` → tap opens wrong account / crashes on .name. One-char.
- [x] (M,P1) `AdHocConversationFlow.jsx` — STALE: handleSummarize already forwards discussedProjectIds/ItemIds (L141-142); CadenceMeetingMode passes them at L568. Already wired. — `discussedProjectIds`/`discussedItemIds` not forwarded into `previewPlan` → every ad-hoc summarize throws away Pip's project-routing signal.
- [x] (S,P1) `pipPlanApply.js:118-130` — FIXED: is_commitment now carried on staged taskEntry. — new_task Gauge-staging path drops `is_commitment` → commitment tasks routed to a project never reach "Your word"/nudges/ledger.
- [x] (S,P1) `pip.js:1238-1248` — FALSE POSITIVE: new_task is always project-bound (rejects no project_id); suggested_project_title is for standalone new_item grouping only. Not applicable. — `normalizePlanRow` new_task branch drops `suggested_project_title` → "Pip suggests a project" banner never fires for task rows.
- [ ] (M,P1) `DigestIngestModal.jsx:91` — OWE rows call `insertTask({title:...})` but column is `text` → verify useTasks.insertTask shape; possible silent null-text task.
- [ ] (M,P1) Health pill contradicts sparkline — AccountDetail header + AccountsView call `gatherSignals` WITHOUT cadences/meetings → missedCadences always 0 → header "Healthy" while sparkline "watching". Pass cadences+meetings in.
- [x] (S,P1) `accountHealth.js:98` computeMissedCadences — added T00:00:00 to meeting_date parse — bare `meeting_date` parsed UTC → off-by-one after ~8pm ET → spurious "cadence missed". Add `+'T00:00:00'`.
- [x] (S,P1) `CadenceHub:2314` — added `.catch` + error toast → silent copy failure (spinner clears, nothing copied). Add catch+toast.
- [ ] (M,P1) `CadenceHub:1338-1347` — multi-dept roster merge has NO dedup → contact in 2 depts appears twice in Pip payload (double-weight / "add known person"). Dedup by id.
- [ ] (M,P1) Circular import `CadenceMeetingMode.jsx:7` ↔ `CadenceHub.jsx:11` (HubProjectCard/PipBriefPanel/OpenItemRow) → extract 3 shared comps.
- [x] (S,P2) `AccountDetail.jsx:228` — todayISO now ET-anchored (Intl, matches accountSnapshots) → fixes pill-vs-sparkline disagreement too.
- [x] (S,P2) `HomeView:975-980` — heroLine now uses `wordCommitments.length` not `wordCommitments.length` → orb says "3 promises due" while check-in handles 2.
- [ ] (M,P2) `HomeView:304,257` — brief cache key UTC vs snapshots ET → 8pm-midnight caches stale under "tomorrow" key → next morning brief stale. Use ET date.
- [ ] (S,P2) `HomeView:615` — brief effect missing `accounts` in dep array → brief never rebuilds if accounts load after guard passes.
- [ ] (M,P2) `OperatorRunButton:21` — no fetch timeout (hangs in "working" forever) + never reads JSON error body.
- [ ] (M,P2) `OperatorHub:239` — draftFor matches `account_name` string → casing/space mismatch silently kills "✦ Draft ready". Join by account_id.
- [ ] (S,P2) `OperatorHub` — "last run" shows only time (no date) → 2-day-old report looks like today. Add full date.
- [x] (S,P2) `contactEngagement.js:68` — overstated: chain already lands on meeting_date; removed dead m.date ref. — reads nonexistent `m.date`, falls back to created_at not meeting_date → "last seen Xd" silently wrong → poisons staleness.
- [ ] (M,P2) `MeetingsTab.jsx:121-135` sendToGauge — direct supabase.insert bypasses addProject → no account_ids[], no logActivity, no realtime.
- [ ] (M,P2) `CadenceTab.jsx:291,294` — pip_summary as plain `<em>` (loses markdown) + delete fires with NO confirm (mis-tap destroys meeting). Use MarkdownText + two-step.
- [ ] (S,P2) `pipPlanApply.js` update_task — silent no-op when findIndex=-1 → add warn/correction log.
- [ ] (S,P2) `pip.js` renderCommitmentsInBlock — UTC "today" → ET-anchored.
- [ ] (M,P2) `CalendarView` (cadence) — gauge due-date extraction non-deterministic w/ 2 "due" custom fields → prefer exact "Due Date".
- [ ] (S,P2) weekly getNextOccurrence returns today even if meeting passed → spurious banner flash. Guard.
- [ ] (S,P2) `PipGaugeCard` team-load keys on `s.assignee||s.assignee_email` but panel writes only assignee_email → s.assignee always undefined.
- [ ] (S,P2) `AddHoc handleApplyPlan` — passes `cadenceId: adHocCadenceId` (undefined?) → set explicit `null`.
- [ ] (S,P3) `meeting_time` malformed "25:99" overflows via setHours → validate.

## §2 — SECURITY & DB HARDENING

- [x] (S,P1) `api/invite.js:47` — `appUrl` from request body embedded in invite email unvalidated → phishing-link vector. Allowlist origins.
- [x] (M,P1) `api/invite.js` — no rate limit → floods arbitrary emails via Resend. Add per-user limiter (pattern from business-review.js).
- [x] (S,P1) `api/invite.js:10` — no email-format validation; raw email to Resend `to:`. Add regex guard.
- [x] (M,P1) `useAuth.js:12-23` — add to SENSITIVE_LOCALSTORAGE_PREFIXES: `folio_portfolio_brief_`, `folio_pip_state_refresh_last_`, `folio_pip_compression_last_`, `folio_checkin_dismissed_` (Pip portfolio analysis survives signout on shared device).
- [ ] (M,P1, FLAGGED) PROD IS SAFE (hardened policy already applied live); this is rebuild-from-scratch-only. Careful SQL fold of phase1_security.sql into schema.sql pending. `schema.sql` + `team_org_layer.sql` — canonical has WEAK `members_self_accept` (no email-guard/role-immutability). Fold phase1_security.sql hardening in (else fresh-rebuild = role-escalation).
- [ ] (M,P2) `useOrg.js:81-90` — pending-invite lookup queries invited_email but NO RLS policy allows it → invite banner never renders for new users. Add `members_invite_read` policy.
- [x] (S,P2, NEEDS-GO) touches LIVE prod DB via MCP — awaiting Chris go. DB: 4 functions mutable search_path (update_updated_at, update_last_interaction, folio_tasks_touch_updated_at, set_updated_at) → `SET search_path = ''`.  — SQL staged (security_hardening_20260617.sql) — confirmed real via advisors; awaiting prod-apply OK
- [x] (S,P2, NEEDS-GO) touches LIVE prod DB + verify not app-called first. DB: REVOKE — WON'T DO (would break RLS: all 6 referenced in live policies; low real risk; proper fix = move to private schema, deferred). 6 SECURITY DEFINER RLS-helpers (folio_member_role_unchanged, folio_org_peer_user_ids, folio_user_org_ids, folio_user_writable_org_ids, gauge_owner_unchanged, rls_auto_enable).  — SQL staged — confirmed real via advisors; awaiting prod-apply OK
- [x] (S,P2, NEEDS-GO) prod auth setting. DB: enable auth_leaked_password_protection (dashboard toggle / config).  — confirmed real — dashboard toggle (Chris)
- [ ] (S,P2) `search_history` localStorage global key not user-scoped → cross-user overwrite. Scope by userId.
- [ ] (S,P2) `App.jsx:875-879` — share-target detects on ANY URL with ?title/text/url → add `pathname==="/share-target"` check (hijack guard).
- [ ] (S,P2) `App.jsx:1434` onAddContacts inline supabase.insert no .catch → route through hook/logSilentFailure.
- [ ] (M,P2) SUMMARIZE_SCHEMA_RULES — no injection-resistance line for untrusted meeting notes. Add.
- [ ] (M,P2) `logActivity` no-ops when orgId null (solo) AND activity_insert RLS requires org → audit-trail is a no-op for solo Chris. Add solo insert policy or document.
- [ ] (S,P2) verify folio_contacts RLS is `(select auth.uid())=user_id` (client .eq redundant — confirm not masking misconfig).
- [ ] (S,P2) `followup-question` answerText uncapped → cap 4000; `detect-terminology`+`followup-question` add server rate limits.

## §3 — PIP WIRING / PARITY (FEED — non-architectural)

- [ ] (M,P1/#1) Chat blind to global People Directory — `globalPeople` passed to PipView but unused; wire → buildContext → renderContextProse (THE #1 "suggests known people as new" fix).
- [ ] (M,P1) `PipView.jsx:241-243` + `pipContext.js:406-468` — dead memory in chat: healthSnapshots, promiseStats, project waiting_on/assignee/requested_by rendered but never populated by buildContext.
- [ ] (M,P1) `pip.js:724+` summarizeDraftPip — operator state (situation/risks/draft) absent → Pip re-suggests already-flagged work. Pass operatorState into bp3Text.
- [ ] (M,P1) `pip.js:529-601` callBriefMePip — Brief Me missing healthSnapshots + recentUpdates + project waiting_on/assignee.
- [ ] (M,P1) `AdHocConversationFlow.jsx:110-155` — ad-hoc summarize omits healthSnapshots/promiseStats/cadence that CadenceHub passes → worse plans on reactive meetings.
- [ ] (M,P1) CadenceHub BeforeYouStart — pre-meeting check-in answers ("they left MSO program") never fed into summarize. Pass as PRE_MEETING_NOTE.
- [ ] (M,P1) verify project_notes (per-project blocks) actually reach summarize payload via onSummarize chain (item 41 unverified).
- [ ] (M,P1) `TeammateDetailView` per-stage assignees shown in UI but NOT sent to Pip → "what's on Dana's plate" unanswerable. Emit stage assignees in pipContext.
- [ ] (S,P2) waiting_on/waiting_on_since not in SUMMARIZE_SCHEMA_RULES → add.
- [ ] (S,P2) cadence brief callCadenceBriefPip missing waiting_on tasks → "blocked on admin 12d" not in pre-call read.
- [ ] (S,P2) `api/generate-questions.js` — no owner_user_id in select → drip questions for not-mine (MSO) accounts (item-38 suppression missing here).
- [ ] (M,P2) `api/pip-state-refresh.js:208-209` — no account_type/is_my_department/owner_user_id/systems selected → departments get external "churn risk" framing; misses multi-account projects (account_ids not OR-queried).
- [ ] (S,P2) relationship_note (why champion/blocker) never rendered in Overview NOR fed to pipContext renderContactsBlock.
- [ ] (S,P2) `remember_fact` tool description doesn't forbid quantitative business data (data-line). Add.
- [ ] (S,P2) compressCorrectionsPip prompt lacks data-line generalization → "$2M" could embed in lessons_learned. Add.
- [ ] (S,P3) pip.js summarize emits only latest status_update vs chat's latest+2 (parity).
- [ ] (S,P3) gaugeFields formatFieldValue person-type resolves members only not contacts → raw email chip on cards.

## §4 — COHERENCE / FRANKENSTEIN (shared helpers, de-dup)

- [ ] (L,P1) **Single `isMine(account, userId)` helper** applied everywhere — HomeView:875 burningRows + :952 aheadRows + StatusBanner cold + generate-questions + pip-state-refresh all ignore owner_user_id → "not mine" MSO accounts reappear as fires/nudges. (item-38 finish)
- [x] (M,P1) `LeaderProjectsView.jsx:26-33` local STATUS_LABELS + C["status"+key] string-concat → use gaugeStatusLabel()/gaugeStatusToken() (boss-facing view).
- [x] (S,P1) `ItemsTab.jsx:255` recipient now via resolveAssignee(members) (email-leak fix).
- [x] (S,P1) `FlatTaskQueue` email.split("@")[0] for initials → resolveAssignee.
- [ ] (P1) verify `CadenceHub:479` verbatim assignee_email + `:750` split("@") still fixed (Batch 2 claimed [x]) → else ownerLabel.
- [ ] (S,P1) METHOD_LABEL duplicated AdHocConversationFlow + StartConversationModal → extract shared.
- [x] (S,P2) STATUS_LABELS dup AccountDetailHeader:25 + AccountsView:34 → export from accountHealth.js; unify green/yellow/red vs healthy/watching/at_risk vocab.
- [x] (S,P2) `OverviewTab:792` sub-account "Watch" → "Watching".
- [x] (M,P2) 4 tabs use bespoke empty-state divs not shared EmptyState (ShopsTab/UpdatesTab/ProjectsTab/CadenceTab); also FlatTaskQueue.
- [ ] (M,P2) `ProjectsTab:122-132,241` + `MeetingsTab` completion task inserts via raw supabase, ProjectModal missing userId/members → no touchAccount/logActivity/source/pip_created_at.
- [ ] (S,P2) `ContactsTab:277` builds insight without PipInsightCard wrapper (loses hex/collapse).
- [ ] (M,P2) `folio_merge_accounts` — re-parent `folio_pip_questions.suggestion.account_id` (+ folio_contact_aliases.account_id) → else post-merge drip writes to dead account.
- [ ] (S,P2) merge deletes source pip_account_state but never refreshes target → stale card. touchAccount(target) or toast.
- [x] (M,P2) LeaderProjectsView + TeammateDetailView count accounts via account_id only → use projectMatchesAccount (account_ids[]).
- [ ] (M,P2) DUAL TASK MODEL — pipPlanApply writes stages; MyQueueView reads stages; FlatTaskQueue/TeammateDetailView read folio_tasks → no single complete view. (see §10 — needs a decision)
- [ ] (S,P2) EditContactModal has is_primary toggle, AddContactModal doesn't → parity.
- [ ] (S,P3) AddItemModal title "Add Open Item" vs "Open Items" vs "Edit Task" naming.
- [ ] (S,P3) `OverviewTab:679` "Recent Deliveries" filters by "✓ Delivered:" string prefix → use source flag.
- [ ] (S,P3) EVERGREEN_QUESTIONS still exported though deprecated → rename/remove.

## §5 — THEME (light + Life mode breakage)

- [x] (S,P1) `index.html` — `--c-bg-pill-active` not defined in Life blocks → ModeToggle active segment wrong in Life. Add to both life blocks.
- [x] (M,P1) `ErrorBoundary.jsx:170,210` color "#fff" hardcoded → C.bg.
- [x] (S,P1) `UserMenu.jsx:128` hardcoded #091712 → C.bg.
- [x] (S,P2) `HexRingCanvas.jsx:53,117-118,126` hardcoded teal/rgba → read var(--c-accent) via getComputedStyle (won't re-skin Life/light).
- [x] (S,P2) `index.html` home-card-ring-glow keyframe hardcoded teal rgba → var(--c-accent-shadow/glow).
- [x] (S,P2) `AccountDetailHeader.jsx:225` Cooling pill rgba(251,191,36) → token.
- [x] (S,P2) `AccountsView.jsx:1248` tag filter rgba(91,143,212) → token.
- [x] (S,P2) `MeetingsTab:387` rgba(0,0,0,0.2) dark smear on light → token.
- [ ] (S,P2) `MeetingsTab:339` →Gauge btn hardcoded blue → statusPlanned token.
- [x] (S,P2) `OverviewTab:620` cold-contact alert rgba(204,140,0) → token.
- [ ] (S,P2) `DigestIngestModal:161` color C.bg on accentDeep bg → near-invisible in light → onAccent/white token.
- [ ] (S,P2) `PipCatchUp` textarea C.bgDark → may be invisible in light → input token.
- [x] (S,P2) `CommandPalette` raw rgba(0,0,0,0.6) → var(--c-overlay-shadow-strong); `Tooltip`/`ConnectionStatus` rgba shadows → overlay-shadow-soft.
- [x] (S,P3, BLOCKED) `AddAccountModal:34,577` raw purple — needs C.purpleFaint/purpleLine tokens (don't exist yet); add tokens first; `ProjectsTab:171` rgba border; `AddContactModal:127` → C.accentFaint; `DesktopLayout:171` gauge nav rgba → tokens.
- [ ] (S,P3) `index.html` Life blocks don't redefine --c-glass-*/--c-pip-card-*/--c-tier-*/--c-status-* → green glass on blue (latent → Life Phase 2 token audit).

## §6 — MOBILE / A11Y

- [x] (M,P1) `Modal.jsx` — no role="dialog"/aria-modal/aria-labelledby + no body scroll-lock + not portaled. Most-used overlay (14+ callers).
- [x] (S,P1) `AccountPicker.jsx:156,232` — inline `outline:"none"` suppresses global :focus-visible → most-used picker has zero keyboard focus indicator.
- [x] (M,P1) `Toast.jsx` — error toasts use role=status/aria-live=polite not role=alert/assertive → failures may never be announced. Two-container.
- [ ] (S,P2) `PersonPicker` fontSize:12 wrapper in summarize preview → iOS zoom risk → 16px.
- [ ] (M,P2) `SummarizeStreamingOverlay` no role=dialog/aria/ESC/reduced-motion + no error/hang recovery → user stuck behind overlay.
- [x] (M,P2) `ChipDropdown` — no aria-haspopup/expanded/listbox/option + no arrow-key nav.
- [x] (M,P2) `UserMenu` dropdown — no role=menu/menuitem + no arrow-key nav.
- [x] (S,P2) `InfoTip`/`Tooltip` — no role=tooltip + aria-describedby (content invisible to screen readers).
- [x] (S,P2) `ErrorBanner` — has BOTH role=alert AND aria-live=polite (polite wins → not assertive). Remove the polite.
- [ ] (S,P2) `AccountDetailTabs` — no role=tablist/tab/aria-selected.
- [x] (S,P2) `AccountMergeModal` "ARE YOU SURE" div → role=alert.
- [x] (S,P2) `AccountPicker` clear-× span → real button + aria-label; add aria-activedescendant on keyboard nav.
- [x] (S,P2) `CommandPalette` — no scroll-into-view for keyboard-focused option.
- [x] (S,P2) `MarkdownText` `##`/`###` render as div not h2/h3 → flat outline.
- [ ] (S,P2) verify CadenceTab inline add-contact + CadenceMeetingMode AddContactInline ≥16px (Batch 7 may have missed these distinct surfaces).
- [ ] (S,P2) HistoryRow expand is div onClick — no role/tabIndex/onKeyDown (keyboard can't expand); verify BeforeYouStart uses <button>.
- [x] (S,P2) `MobileLayout` workspaces popover lacks id/aria-controls; no skip-to-content on mobile.
- [ ] (S,P3) AuthView success message lacks role=status/aria-live; CheckInCard receipts lack role=status/aria-live.
- [x] (S,P3) Buttons: DangerBtn can't take type/aria-label (unify 4 button prop interfaces); LitPill sets disabled not aria-disabled; Glow renders <button disabled> for decorative text; AddToTasksButton/GaugeIcon missing aria.
- [x] (S,P3) AddContactModal/EditContactModal toggle divs lack role/tabIndex/onKeyDown; Mine/Not-mine toggle needs aria-pressed; calendar day cells no role=gridcell.
- [x] (S,P3) HexRingCanvas — no prefers-reduced-motion guard (WCAG 2.3.3).
- [ ] (S,P3) HexSignature off-spec: HomeView:2010 cells={2}→{3}; AuthView:310 peak=0.28/cell=5 → canonical.

## §7 — PERFORMANCE / COST

- [ ] (S,P1) `api/pip.js` 5 endpoints send static system prompts with NO cache_control (business-review, detect-terminology, generate-questions, leadership-readout, profile-synthesis) → generate-questions alone ~60-70% per-call cut.
- [ ] (M,P1) `pip-state-refresh.js:293` Promise.all up to 50 simultaneous Haiku → add ACCOUNT_CONCURRENCY=4 waves.
- [ ] (M,P1) `useMeetings.js:19` per-account fetch no .limit() + selects `*` (notes/pip_summary/pip_email blobs) → column-select + limit(150); global selects `*`×300 → column-select.
- [ ] (M,P2) `summarizeDraftPip` BP2 cache fragility — profileProse varies by 1 char → 4-block cache collapses (>2× cost). Normalize+freeze per session.
- [ ] (S,P2) Unbounded queries add .limit(): usePipAccountState (50), usePipAssignmentHints (200), usePipFacts (50); useCadences/usePersonCadences.
- [ ] (M,P2) Cold-open query gating (~18-20 concurrent, target 15): fetchAllUpdates→Pip view, useRecentThemes→Home, useCustomWorkspaces→Accounts nav, cache solo-org flag.
- [ ] (S,P2) portfolioThemes Object.assign'd onto EVERY account → serialized N× in payload. Make top-level.
- [ ] (M,P2) item 48.3 — activity-gate pip-state-refresh triggers (cuts 70-90%); drop chat-open 20-stale sweep now operator-run covers state.
- [ ] (S,P2) `useBreakpoint.js` no debounce on resize → re-renders every consumer per pixel → matchMedia threshold listener.
- [ ] (S,P2) `useAccountSnapshots.js:14` `var fetch` shadows global fetch → rename; add realtime subscription (device B stale all session).
- [ ] (M,P2) `PipGaugeCard` not useMemo'd — O(n×m) over all stages on every render incl. search keystroke.
- [ ] (S,P2) projectSuggestions useMemo busted by inline onCreateProject in 3 callers → useCallback.
- [ ] (S,P2) `HomeView:1301` playSequence hardcodes 6 cards → derive count; checkInAnswered reads localStorage in hot memo → useState.
- [ ] (S,P3) `_pipUsage.js:122` hardcoded -05:00 offset → Intl ET (spend-cap boundary off 1h in EDT).
- [ ] (M,P3) commitTask/stages full-array overwrite race (two-device clobber) → gauge_patch_stage RPC (like gauge_append_status_update). Also pipPlanApply stale-snapshot flush.

## §8 — GUARDS / CI / TESTS

- [ ] (M,P1) check-guards Guard 1 — add missing-catch detection for high-risk async (navigator.clipboard/fetch) + dotAll flag + treat comment-only body as empty (root cause of wave-2 escapes).
- [ ] (S,P2) check-guards Guard 4 — robustness for multi-line JSX where fontSize follows first `>`.
- [ ] (S,P2) Add Guard 5 — hook-order (use* below authLoading return; React #310, bit Chris 3×).
- [ ] (S,P2) Add Guard 6 — `new Date("YYYY-MM-DD")` without T00:00:00 (ET drift class).
- [ ] (S,P2) CI: add `npm run lint` step; add `npm audit --omit=dev` step.
- [ ] (S,P2) `npm audit fix` — form-data CRLF HIGH (devDep-only chain).
- [ ] (M,P1) Tests: `pipPlanApply.js` ZERO coverage (highest-consequence write fn) + normalizePlanRow edge cases.
- [ ] (M,P2) Tests: useAuth signout-wipe, invite.js authz+appUrl sanitize, activity.js sanitizePayload, pipIntent.js rules engine, digestParse QUIET-without-person, computeMissedCadences date-boundary.

## §9 — DOCS

- [x] (M,P2) docs/ suite — operator described as "nightly cron" everywhere → "manual trigger" (product-overview.md, ai-governance.md +); regenerate PDFs (`npm run docs:pdf`).
- [ ] (S,P2) document client-side WORK_CLAUDE_PROMPT in ai-governance.md; document `===PLAN===` two-phase delimiter as locked interface.
- [ ] (S,P2) document merge re-parenting extensions in data-handling.md; document cadence/CalendarView scoping (intentional dual file).
- [ ] (S,P2) CLAUDE.md — SportsCard documented-as-shipped but doesn't exist → move Shipped→Ripped; remove vestigial `folio_sports_cache_v1` from useAuth wipe.

## §10 — BIGGER / STRUCTURAL (architecture — may exceed 2h; decide scope)

- [ ] (L) **THE ONE THING** — single `buildAccountContext()` layer feeding chat/brief/summarize/operator (kills the parity-drift bug class permanently). ~week. See X6.
- [ ] (L) Resolve dual task-model: pick canonical store (folio_tasks) or read both everywhere; heal effect for Pip-staged tasks. (§4 dup)
- [ ] (L) File splits (all >1500 lines): SettingsView (1835, extract sections/), CadenceHub (2416), HomeView (2405 → HomeBriefHub + useHomeSignals), pip.js (1580).
- [ ] (M) Event-driven recompute generalized (item 48 levers): pip-state-refresh gating, conditional output fields, on-demand draft emails, skip roll-up on quiet nights.
- [ ] (L, future) Pip agent loop (tool_result round-trip, chat only); pgvector semantic recall (Pip summaries only). X6 F5/F6.

---

### Quick-win cluster to start (all S, low-risk, high-felt):
StandingBoardView complete-flip · ask-pip maxDuration · useItems Closed · CommitmentsView arg · accountHealth date · CadenceHub clipboard catch · heroLine count · the §5 hardcoded-color swaps · the stale-cron doc/comment cleanup.

---

## ✅ VERIFIED SWEEP — 2026-06-17 (read-only agent, each item checked against live code)

Counts of items still open at sweep time: **REAL 72 · DONE 11 · FALSE 3 · JUDGMENT 4.**

**FALSE / DONE (stop revisiting these):**
- FALSE — DigestIngestModal:91 (insertTask uses correct `title` column)
- FALSE — folio_contacts RLS already `(select auth.uid())` (efficient form)
- FALSE — relationship_note already wired (pip.js:272, pipContext:394, ContactsTab:393)
- DONE — CadenceHub multi-dept roster dedup (seen[c.id] present)
- DONE — CadenceHub:479/750 email leaks (now via ownerLabel)
- DONE — AdHoc routing signal (forwarded L141-142 + CMM L568)
- DONE — HistoryRow keyboard a11y; digestParse test; pipPlanApply test; ci lint/audit steps
- DONE — useAccountSnapshots realtime present (var fetch shadow cosmetic)

**JUDGMENT (need a decision / runtime check):** CalendarView dual-"due" custom-field; project_notes→summarize runtime trace; members_self_accept rebuild-only; CadenceTab/inline add-contact ≥16px visual check.

**TOP REAL by severity (the fix order):**
P0: (1) portfolio-brief.js handler outside try-catch; (2) App.jsx:875 share-target hijack guard; (3) circular import CadenceMeetingMode↔CadenceHub.
P1: (4) PipView buildContext missing globalPeople [the "suggests known people" bug]; (5) buildContext missing healthSnapshots/promiseStats; (6) useItems Closed filter; (7) health-pill vs sparkline (gatherSignals missing cadences+meetings); (8) summarize missing operator state; (9) api/pip.js 5 endpoints missing cache_control [cost]; (10) pip-state-refresh 50-call concurrency cap.
P2: (11) OperatorHub draftFor string-match; (12) logActivity no-op for solo; (13) followup-question uncapped/no-rate-limit; (14) merge doesn't re-parent suggestion/alias account_id; (15) useMeetings select(*) no limit.

Full per-item REAL list lives in the sweep result (session record). §3 (Pip-wiring, ~16 real) + §10 (structural: buildAccountContext, dual-task-model, file splits) are the heavy reserved-for-a-session work.
