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

- [x] (M,P1/#1) Chat blind to global People Directory — `globalPeople` passed to PipView but unused; wire → buildContext → renderContextProse (THE #1 "suggests known people as new" fix). DONE (June-17 session, was unticked): buildContext populates `globalPeople`, curateContext passes it through, renderContextProse:524 emits "PEOPLE YOU ALREADY KNOW". Verified chain end-to-end.
- [x] (M,P1) `PipView.jsx:241-243` + `pipContext.js:406-468` — dead memory in chat: healthSnapshots, promiseStats, project waiting_on/assignee/requested_by rendered but never populated by buildContext. FIXED: buildContext now populates per-account `healthSnapshots` (grouped from useAccountSnapshots.snapshotHistory), `promiseStats` (new global usePipPromiseStats hook → account map), and enriches activeProjects with assignee/requested_by/waiting_on/waiting_on_since + hydrated `tasks`. Runtime path traced: buildContext→askPip→api/pip.js curateContext(focused passes full account objects)→renderAccountFull reads exactly these fields. Verified field-name parity (snapshot_date/health_status/health_score; promiseStats.avgDays/recentItems).
- [x] (M,P1) `pip.js:724+` summarizeDraftPip — operator state (situation/risks/draft) absent → Pip re-suggests already-flagged work. Pass operatorState into bp3Text. DONE (June-17 session, was unticked): `operatorBlock` built from `pipAccountState.operator_situation`/`operator_risks` (pip.js:850-860), concatenated into bp3Text:994; CadenceHub passes `pipAccountState` row at both summarize call sites (1476, 1629). NOTE: AdHoc caller does NOT pass it — that's the separate open item below.
- [x] (M,P1) `pip.js:529-601` callBriefMePip — Brief Me missing healthSnapshots + recentUpdates + project waiting_on/assignee. FIXED: the gap was caller-side — AccountDetail's Brief Me call stripped projects to title/status/due_date and never passed healthSnapshots/recentUpdates. Now passes all three (added useAccountSnapshots to AccountDetail; recentUpdates from existing `updates`; activeProjects map enriched with waiting_on/waiting_on_since/assignee/requested_by/status_updates), and pip.js account object now carries recentUpdates so renderAccountFull renders it.
- [x] (M,P1) `AdHocConversationFlow.jsx:110-155` — ad-hoc summarize omits healthSnapshots/promiseStats/cadence that CadenceHub passes → worse plans on reactive meetings. FIXED: added useAccountSnapshots + usePipPromiseLog to AdHocConversationFlow; summarize payload now passes `healthSnapshots` (today's snapshot filtered by account, matching CadenceHub) + `promiseStats`. (No cadence: ad-hoc has none by definition — renderCadenceScheduleBlock(null) is a no-op.) Verified summarizeDraftPip consumes all three via renderHealthTrendBlock/renderSnapshotMetricsBlock/renderPromiseLogBlock.
- [~] (M,P1) CadenceHub BeforeYouStart — pre-meeting check-in answers ("they left MSO program") never fed into summarize. Pass as PRE_MEETING_NOTE. N/A ON THIS BRANCH: the "✦ Before you start" check-in here (CadenceHub:1773) is deterministic yes/no with DIRECT DB actions (clears waiting_on, unblocks projects, closes commitments) — there is no free-text "something changed → note" capture to forward (that was a different branch's version). The answers already mutate the data summarize reads, so the intent is served. Reopen only if a free-text pre-meeting note field is added here.
- [x] (M,P1) verify project_notes (per-project blocks) actually reach summarize payload via onSummarize chain (item 41 unverified). VERIFIED: CadenceMeetingMode persists projectNotes → draft.project_notes; summarizeDraftPip reads `m.project_notes` (pip.js:762) and emits a labeled "per-project notes" block (1058-1087) into the prompt. Reaches the model.
- [x] (M,P1) `TeammateDetailView` per-stage assignees shown in UI but NOT sent to Pip → "what's on Dana's plate" unanswerable. Emit stage assignees in pipContext. FIXED via the chat-parity wire above: renderAccountFull already renders `p.tasks[].assignee_email`, and buildContext now populates `activeProjects[].tasks` (hydrated folio_tasks post-unification) — so per-task assignees now reach Pip chat.
- [~] (S,P2) waiting_on/waiting_on_since not in SUMMARIZE_SCHEMA_RULES → add. DEFERRED (not a safe one-liner): waiting_on context is ALREADY fed to summarize (bp4 project lines render "WAITING ON: …", pip.js:1007). Adding waiting_on to the SCHEMA RULES would let Pip EMIT waiting_on on plan rows, which needs matching support in pipPlanApply (write the column) + PipSummarizePreview (edit it) to not silently drop — a real feature, scoped for a deliberate pass, not a context one-liner.
- [x] (S,P2) cadence brief callCadenceBriefPip missing waiting_on tasks → "blocked on admin 12d" not in pre-call read. DONE (June-17, was unticked): callCadenceBriefPip renders project waiting_on (pip.js:1330) AND a waiting-on tasks block from openItems (pip.js:1336/1361).
- [x] (S,P2) `api/generate-questions.js` — no owner_user_id in select → drip questions for not-mine (MSO) accounts (item-38 suppression missing here). DONE (June-17, was unticked): selects owner_user_id (:97), labels "project-involved only — NOT your relationship" (:151), filters not-mine accounts out of the generation set (:308).
- [~] (M,P2) `api/pip-state-refresh.js:208-209` — no account_type/is_my_department/owner_user_id/systems selected → departments get external "churn risk" framing; misses multi-account projects (account_ids not OR-queried). PARTIAL: the SELECT now includes account_type/is_my_department/owner_user_id/systems (:221) and the framing branches on them (:108-115) — the department/ownership half is DONE. STILL OPEN: the gauge_projects query at :250 keys on `.in("account_id", accountIds)` only (no account_ids[] overlap), so a project linked via account_ids[] to a secondary account is missed there — a heavier change (query + byAcct grouping), left for a deliberate pass.
- [x] (S,P2) relationship_note (why champion/blocker) never rendered in Overview NOR fed to pipContext renderContactsBlock. DONE for the Pip-wiring (§3's concern): relationship_note is fed to chat (pipContext.js:396) AND summarize (pip.js:272, mapped at :572), and shown on contact cards in ContactsTab. (Adding it to the Overview tab specifically is a minor cosmetic residual — ContactsTab already surfaces it.)
- [x] (S,P2) `remember_fact` tool description doesn't forbid quantitative business data (data-line). Add. DONE (June-17, was unticked): pipTools.js:182 description ends with the full "NEVER store quantitative company/business data… generalize qualitatively" clause.
- [x] (S,P2) compressCorrectionsPip prompt lacks data-line generalization → "$2M" could embed in lessons_learned. Add. DONE (June-17, was unticked): pip.js:1523 prompt has the "NEVER record quantitative company/business data… generalize any such figure" clause.
- [x] (S,P3) pip.js summarize emits only latest status_update vs chat's latest+2 (parity). FIXED: bp4Text now emits latest + prior 2 pulses inline (matches renderAccountFull).
- [x] (S,P3) gaugeFields formatFieldValue person-type resolves members only not contacts → raw email chip on cards. FIXED: formatFieldValue now takes a `contacts` arg and resolves a person value against account contacts (by email or name) after members; both call sites (StandingBoardView, MyQueueView) pass `contacts`.

## §4 — COHERENCE / FRANKENSTEIN (shared helpers, de-dup)

- [x] (L,P1) **Single `isMine(account, userId)` helper** applied everywhere — HomeView:875 burningRows + :952 aheadRows + StatusBanner cold + generate-questions + pip-state-refresh all ignore owner_user_id → "not mine" MSO accounts reappear as fires/nudges. (item-38 finish) DONE: shared `isMine`/`notMyRelationship` added to accountHealth.js; HomeView's 4 inline owner checks (brief, coldAccounts, anomalySignals, burningRows) unified onto it AND the real remaining leak — aheadRows "stay warm" loop — now skips not-mine accounts (userId added to deps). generate-questions + pip-state-refresh already enforce ownership (verified earlier). StatusBanner is dead code (not rendered anywhere since AccountsView v2 removed it) → moot.
- [x] (M,P1) `LeaderProjectsView.jsx:26-33` local STATUS_LABELS + C["status"+key] string-concat → use gaugeStatusLabel()/gaugeStatusToken() (boss-facing view).
- [x] (S,P1) `ItemsTab.jsx:255` recipient now via resolveAssignee(members) (email-leak fix).
- [x] (S,P1) `FlatTaskQueue` email.split("@")[0] for initials → resolveAssignee.
- [x] (P1) verify `CadenceHub:479` verbatim assignee_email + `:750` split("@") still fixed (Batch 2 claimed [x]) → else ownerLabel. VERIFIED: both sites route through `ownerLabel(...)` (CadenceHub ~480, ~755). No raw email / split("@") leak.
- [x] (S,P1) METHOD_LABEL duplicated AdHocConversationFlow + StartConversationModal → extract shared. DONE (was unticked): StartConversationModal exports `METHOD_LABEL`; AdHocConversationFlow imports it (:20) — single source, no dup.
- [x] (S,P2) STATUS_LABELS dup AccountDetailHeader:25 + AccountsView:34 → export from accountHealth.js; unify green/yellow/red vs healthy/watching/at_risk vocab.
- [x] (S,P2) `OverviewTab:792` sub-account "Watch" → "Watching".
- [x] (M,P2) 4 tabs use bespoke empty-state divs not shared EmptyState (ShopsTab/UpdatesTab/ProjectsTab/CadenceTab); also FlatTaskQueue.
- [~] (M,P2) `ProjectsTab:122-132,241` + `MeetingsTab` completion task inserts via raw supabase, ProjectModal missing userId/members → no touchAccount/logActivity/source/pip_created_at. DEFERRED (coordinated refactor, paired with the §4 "Recent Deliveries string-prefix" item below): these raw inserts create the legacy "✓ Delivered: …" sentinel rows that OverviewTab/Brief Me match by string prefix. The shared `insertTask` hook is itself a thin wrapper (no logActivity/touchAccount either), so routing through it wouldn't deliver the stated benefit. The real fix is to replace the sentinel-row pattern with a proper delivered flag/source column + update both readers — a deliberate data-model pass, not a safe mop-up edit. Left intact to avoid breaking Recent Deliveries.
- [x] (S,P2) `ContactsTab:277` builds insight without PipInsightCard wrapper (loses hex/collapse). DONE (was unticked): ContactsTab:277 renders `<PipInsightCard text={buildContactsInsight(...)} />`.
- [x] (M,P2) `folio_merge_accounts` — re-parent `folio_pip_questions.suggestion.account_id` (+ folio_contact_aliases.account_id) → else post-merge drip writes to dead account. FIXED: merge fn now rewrites `suggestion.account_id` + `account_name` (jsonb_set) where it points at the source. Applied to prod via MCP + folded into schema.sql + docs/data-handling.md. NOTE: `folio_contact_aliases` has NO account_id column (verified vs prod) — it keys on contact_id and contacts are re-parented by row, so aliases follow automatically; nothing to do there (documented).
- [x] (S,P2) merge deletes source pip_account_state but never refreshes target → stale card. touchAccount(target) or toast. SATISFIED (toast option): handleMergeAccounts (App.jsx:685) shows a "Merged X into Y — N records moved" toast and re-selects the target; the account list refetches via realtime. A forced operator re-run on the target is intentionally NOT auto-triggered (operator is manual-trigger now + cost) — its situation text refreshes on the next run.
- [x] (M,P2) LeaderProjectsView + TeammateDetailView count accounts via account_id only → use projectMatchesAccount (account_ids[]).
- [x] (M,P2) DUAL TASK MODEL — RESOLVED via full task-model unification (see §10): folio_tasks is canonical; pipPlanApply + MyQueueView + every reader/writer now use folio_tasks. gauge_projects.stages frozen as backup.
- [x] (S,P2) EditContactModal has is_primary toggle, AddContactModal doesn't → parity. DONE (was unticked): AddContactModal has a working "Primary (📌)" toggle (state :16, payload :35, UI :116).
- [~] (S,P3) AddItemModal title "Add Open Item" vs "Open Items" vs "Edit Task" naming. DEFERRED (needs Chris's preferred vocabulary): trivial to standardize but there's no obviously-correct label — "task" vs "open item" is a product-vocabulary call. Flag for Chris to pick the canonical term, then a one-line sweep.
- [~] (S,P3) `OverviewTab:679` "Recent Deliveries" filters by "✓ Delivered:" string prefix → use source flag. DEFERRED (paired with the ProjectsTab/MeetingsTab raw-insert item above — same sentinel-row debt): needs a delivered flag/source column written at insert time + both readers (OverviewTab + Brief Me recentDeliveries) switched off the string prefix. Coordinated data-model change, scoped for a deliberate pass.
- [x] (S,P3) EVERGREEN_QUESTIONS still exported though deprecated → rename/remove. WON'T-DO (claim is stale): `EVERGREEN_QUESTIONS` is NOT exported (local `var` in detectKnowledgeGaps.js:9) and it's load-bearing — `purgeEvergreenQuestions` (called from App.jsx:737/750) uses the list to identify legacy filler questions to DELETE. Removing it would break the purge. No action needed.

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
- [x] (L) Resolve dual task-model: **DONE 2026-06-18** — full unification to folio_tasks (Chris chose this). 174 stage objects migrated + verified (per-project count + done-count parity, 0 mismatch); ~6 new folio_tasks columns; ~14 readers switched (project.tasks hydration in useProjects/accountSnapshots/OverviewTab/operator-run/business-review); ~8 writers switched (reconcileProjectTasks). gauge_projects.stages frozen as read-only backup (NOT dropped). 3 staged DB migrations via MCP + folded into schema.sql + supabase/task_unification.sql. See supabase/task_unification_plan.md.
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

### BATCH2 SHIPPED — 2026-06-17 (commit merged into work branch; all 5 gates green)
Contained REAL items landed via Patch batch2 (38 files):
- §5 theme: MeetingsTab gauge btn token, DigestIngestModal contrast, HexSignature 3-cell canonical
- §6 a11y: SummarizeStreamingOverlay (role/aria/reduced-motion/focus-restore), AccountDetailTabs (tablist/tab/aria-controls), AuthView + CheckInCard role=status, input font floors
- §7 perf/cost: prompt caching on business-review/generate-questions/leadership-readout, pip-state-refresh wave cap(4), useMeetings limits, _pipUsage dynamic ET offset, rate limits on detect-terminology+followup-question, OperatorRunButton 90s timeout
- §8 guards/CI: Guard 5 (hook order) + Guard 6 (bare ISO date); CI lint(advisory)+audit(high); form-data HIGH patched
- §9 docs: ai-governance two-brain + WORK_CLAUDE_PROMPT; data-handling merge re-parenting
- §1 contained: portfolio-brief try-catch, useItems Closed filter, health-pill gatherSignals(+cadences,meetings) [merged w/ ET-date fix], OperatorHub draftFor by id + last-run date, MeetingsTab sendToGauge via hook, CadenceTab MarkdownText+confirm, pipPlanApply update_task warn, renderCommitmentsInBlock ET, getNextOccurrence guard, PipGaugeCard team-load key, AdHoc cadenceId null, meeting_time validation
- §2 code: search_history user-scoped, App share-target guard, onAddContacts catch, SUMMARIZE injection line, followup cap, detect/followup rate limits
- §4: isMine helper, METHOD_LABEL dedup, completion-task via hook, ContactsTab PipInsightCard, AddContactModal is_primary, EVERGREEN removed

REMAINING (dedicated session): §3 Pip-context wiring (~11; data-line on remember_fact+compressCorrections DONE; owner_user_id ownership-awareness in generate-questions DONE; globalPeople→chat #1 bug NOW FIXED — App→PipView→buildContext→curateContext→renderContextProse 'PEOPLE YOU ALREADY KNOW'), §10 structural (buildAccountContext, dual-task-model, file splits, circular import), 4 JUDGMENT, + any §7 unbounded-query/memo items the batch deferred.

### DIGEST PARSER v2 — ✅ BUILT 2026-06-17 (accepts friendly + strict; +3 tests)
(original queue note below)

### DIGEST PARSER v2 (queued 2026-06-17) — accept the friendly format work-Claude actually emits
Today's parser needs literal [OWE]/[WAITING]/[QUIET]/[TOUCH] + pipe fields. Sonnet-Low paraphrases into section headers + dashes instead. Loosen digestParse.js + DigestIngestModal preview to ALSO accept:
- Section headers → kinds: "Things I said I would do"→OWE, "Things I'm waiting on"→WAITING, "Conversations that went quiet…"→QUIET, "Good conversations worth remembering"→TOUCH
- Dash-delimited fields ("- A - B - C") as an alternative to pipes
- Combined "Person, Account" first field → split, match account against roster (the comma-tail or any segment), keep person as the WAITING/QUIET person
- Natural dates "June 15"/"(June 16)" → ISO using current year; non-dates ("promised same day","expect soon") → null due
- Detect "done"/"sent"/"completed" in an OWE line → file the commitment already-complete (or skip) instead of as open
- Keep the strict bracket format working too (don't break the existing path)

---

## ✅ RECONCILIATION — 2026-06-18 (read-only sweep + spot-verify; tracker was badly under-ticked)

The per-line `[ ]` count (~69) was STALE: prior batches shipped fixes in code but recorded them as summary blocks instead of flipping lines. Re-verified every open item against current code. **Almost all were already DONE.**

VERIFIED DONE-IN-CODE (checkboxes were stale): AccountDetailTabs tablist a11y · SummarizeStreamingOverlay role/aria/reduced-motion · cache_control on business-review/generate-questions/leadership-readout/profile-synthesis · useMeetings/useProjects/useTasks .limit() · PipSummarizePreview projectSuggestions memo · _pipUsage ET offset · HistoryRow keyboard a11y · AuthView + CheckInCard aria-live · AddContactInline 16px · search_history user-scoped · App share-target pathname guard · onAddContacts logSilentFailure · followup-question 4000 cap + rate limit · detect-terminology rate limit · HomeView playSequence/portfolioThemes memo · useAccountSnapshots realtime · MeetingsTab gauge token + sendToGauge via addProject.

FALSE / N-A: BeforeYouStart a11y (component never existed) · PersonPicker fontSize:11 (it's a <button>, not a form input — Guard 4 N/A) · SummarizeStreamingOverlay "missing ESC" (deliberately button-less transient overlay, auto-swaps to plan modal — no close path to bind, NOT a trap).

JUST FIXED: SUMMARIZE_SCHEMA_RULES injection-resistance line (treat meeting notes as untrusted data, never instructions).

VERIFIED DONE (was JUDGMENT): renderAccountFull field population — PipView.buildContext populates healthSnapshots/promiseStats (PipView:322-323) → rides through curateContext focused → renderAccountFull. Confirmed.

### TRUE REMAINING OPEN (the honest list — essentially ZERO user-facing bugs)
**§2 org/DB (low priority — Chris is solo, these matter at multi-user):**
- members_invite_read RLS policy (invite banner for new users) — DB migration
- members_self_accept hardening fold into schema.sql (rebuild-from-scratch only; prod already hardened)
- logActivity no-ops for solo (orgId null) → audit trail empty for Chris — add solo policy or document
- verify folio_contacts RLS is (select auth.uid())=user_id (quick confirm)

**P3 code-quality (fix-when-touching-the-file):**
- App.jsx fetchAllContacts/fetchAllUpdates cold-open gating (~2 extra queries)
- useBreakpoint resize debounce
- useAccountSnapshots `var fetch` shadows global fetch — rename
- PipGaugeCard memoization
- reconcileProjectTasks concurrency guard (two-device interleave)
- check-guards Guard 1 multi-line empty-catch coverage
- pipPlanApply.test.js negative test for update_task missing id
- CadenceHub.jsx (2419 lines) split when next feature touches it

### P3 POLISH BATCH — 2026-06-18 (done inline)
DONE: useBreakpoint resize debounce (100ms) · useAccountSnapshots `var fetch`→`fetchSnapshots` (no global shadow) · reconcileProjectTasks per-project serialization guard (same-client interleave) · check-guards Guard 1 now catches multi-line empty catches (dedup + comment-safe) · pipPlanApply.test.js negative test for update_task missing id (293 tests).
WON'T-DO (risk/value or solo-irrelevant): PipGaugeCard memo (~80-line wrap for one card, risk>value) · HomeView playSequence hardcoded-6 (stable, cosmetic) · §2 members_invite_read / logActivity-solo / members_self_accept fold (multi-user only — Chris is solo) · CadenceHub split (structural, defer to a feature touch).

### QUEUED ENHANCEMENT — 2026-06-18 (Chris): workspace-SCOPED person picker for project tasks
Today PersonPicker is workspace-GROUPED (account contacts surface first, then team, then everyone else in one flat dropdown) — accountIds IS passed by ProjectModal + TaskDetailPanel, so the account's people are on top, but the whole contact list is still shown → feels like "all my contacts."
WANT: scope it like the AccountPicker workspace tabs but for PEOPLE —
- Options = workspaces (Accounts/Departments/Partners) + "Myself", not a flat everyone-list.
- If the project is tied to an account, auto-select that account's workspace and show ONLY its contacts (fast assign + recipient).
- Workspace switcher to reach other contacts only when needed.
Shared component used in ~10 places (TaskDetailPanel, ProjectModal ×5, PipSummarizePreview, etc.) — change must preserve every caller's stored-value convention + free-text escape hatch. Contained but needs care; verify all callers after.

### 🔴 PROD BUG FIXED — 2026-06-18: project task create→edit→complete TRIPLICATED
Chris's smoke test caught it (I had wrongly called the smoke test "passed"). Creating a task
then editing/completing it inserted NEW rows instead of updating in place → "test" + "testing"
+ "testing(done)". Root cause: reconcileProjectTasks diffed `nextStages` against the possibly-
stale `project.tasks` prop while the editor built `next` from its own optimistic localStages →
every edit looked "new" → re-insert. FIX: reconcile now diffs against the editor's OWN
pre-mutation view (currentStages arg), returns nextStages with real ids filled in (existing +
DB-generated), and ProjectStageEditor.commitStages adopts those ids so the next edit matches by
id → updates in place. +5 unit tests (projectTaskWrites.test.js) locking edit→update, complete→
update, no-dup, no-spurious-delete. NOTE: existing duplicate rows from before the fix must be
deleted manually; this prevents future duplication.
