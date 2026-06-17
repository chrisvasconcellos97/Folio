import { useState, useMemo } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { showToast } from "../../components/Toast";
import { InfoTip } from "../../components/InfoTip";
import { PersonPicker } from "../../components/PersonPicker";
import { isDefaultMeetingTitle } from "../../lib/meetingTitle";
// Presentational layer (pure helpers + stateless leaf sub-components) extracted
// to PipSummarizePreviewRows.jsx — Batch 8. This file is the orchestration /
// state container that composes them; behavior is unchanged.
import {
  INTER, MONO,
  fmtDate, findItem, findProject, findTask,
  initialTitle, hasEditableTitle, rowLeader, currentTextForUpdate,
  rowGroup, hasAssignee, hasDueEdit,
  PlanPeopleChip, RowCheckbox, DueInput, TargetAccountChip,
  TitleInput, SourceExpander, UnknownPersonRow,
} from "./PipSummarizePreviewRows";

export function PipSummarizePreview({
  plan: rawPlan,
  existingItems,
  activeProjects,
  orgMembers,
  onApply,
  onCancel,
  onLogCorrections,  // (entries[]) => Promise — fire-and-forget V2-brain capture
  meetingId,         // optional; tags corrections with the draft they came from
  accountRoster,     // [{ id, name, account_type }] — for cross-account routing
  currentAccountId,  // the account this meeting belongs to (null for person 1:1s)
  skippedByPip,      // true when notes were too short for Pip to extract anything
  isPersonCadence,   // true when this is a person 1:1 — items need account routing
  suggestedTitle,    // from Pip's summarize response — proposed meeting title
  meetingTitle,      // current meeting title (to detect system-default titles)
  onTitleChange,     // (newTitle) => void — called when user edits the title
  onTitleSave,       // (title: string) => void — called after successful Apply when title was set
  unknownPeople,     // [{ name, context_snippet }] — people Pip noticed but aren't contacts
  receipts,          // [string] — knowledge Pip actually used for this plan (taught terms, recognized people, update events)
  onAddContact,      // ({ name, role, email }) => Promise — saves a new contact
  onCreateProject,   // (accountId, { title }) => Promise<project> — optional; creates a Gauge project
  accountContacts,   // optional: [{ id, name, role }] — contacts for this account as assignee options
  discussedProjectIds = [],  // UUIDs of projects the user flagged as discussed
  discussedItemIds    = [],  // UUIDs of items/tasks the user flagged as discussed
}) {
  // Sanitize Pip's plan: drop update rows that point at a task/item we can't
  // resolve, or that carry no concrete field change. Pip sometimes emits an
  // update_task on a "discussed" project without a real task to update —
  // these rendered as a useless "(empty) → (blank)" row that does nothing on
  // apply. Shadowing the prop means every downstream use sees the clean plan.
  var plan = useMemo(function () {
    return (rawPlan || []).filter(function (r) {
      if (r.kind === "update_task") {
        var p = findProject(activeProjects, r.project_id);
        var t = p && findTask(p, r.task_id);
        if (!t) return false;
        if (!r.fields || Object.keys(r.fields).length === 0) return false;
      }
      if (r.kind === "update_item") {
        var it = findItem(existingItems, r.target_id);
        if (!it) return false;
        if (!r.fields || Object.keys(r.fields).length === 0) return false;
      }
      return true;
    });
  }, [rawPlan, activeProjects, existingItems]);

  // Shared workspace-grouped person picker (account contacts first → My Team →
  // others) with a free-text escape hatch — same component used everywhere else
  // for assignee/recipient so the app stays uniform. A plain function (not a
  // component) so PersonPicker keeps its state across re-renders.
  var personAccountIds = currentAccountId ? [currentAccountId] : [];
  function personField(value, onChange, noneLabel) {
    return (
      <PersonPicker
        value={value}
        onChange={onChange}
        members={orgMembers}
        contacts={accountContacts}
        accounts={accountRoster}
        accountIds={personAccountIds}
        noneLabel={noneLabel || "— Unassigned —"}
        style={{ fontSize: 12, maxWidth: 220 }}
      />
    );
  }

  var rosterLookup = useMemo(function () {
    var map = {};
    (accountRoster || []).forEach(function (a) { map[a.id] = a; });
    return map;
  }, [accountRoster]);

  var currentAccountName = useMemo(function () {
    if (!currentAccountId) return isPersonCadence ? "Personal / No account" : "Current Account";
    var a = rosterLookup[currentAccountId];
    return (a && a.name) ? a.name : "Current Account";
  }, [currentAccountId, rosterLookup, isPersonCadence]);

  var rosterOptions = useMemo(function () {
    return (accountRoster || [])
      .filter(function (a) { return a.id !== currentAccountId; })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }, [accountRoster, currentAccountId]);

  // Per-row UI state. titleOverride / excerptOverride land at apply time
  // (excerpt is captured for the future learning loop — no-op today).
  var initialState = useMemo(function () {
    return (plan || []).map(function (r) {
      var t = initialTitle(r);
      return {
        checked: r.confidence !== "low",
        assignee: r.suggested_assignee || null,
        recipient: r.suggested_recipient || null,
        suggestedAssignee: r.suggested_assignee || null,
        due_date: hasDueEdit(r.kind) ? (r.due_date || null) : null,
        title: t,
        initialTitle: t,
        excerpt: r.source_excerpt || "",
        initialExcerpt: r.source_excerpt || "",
        targetAccountId: r.target_account_id || null,
        initialTargetAccountId: r.target_account_id || null,
        isCommitment: r.is_commitment === true,
        pipFlaggedCommitment: r.is_commitment === true,
        // new_task rows reflect Pip's routed project so the picker shows it and
        // can be changed — incl. "Not in Gauge" to pull the task out standalone.
        gaugeProjectId: r.kind === "new_task" ? (r.project_id || null) : null,
        asProject: false,
      };
    });
  }, [plan]);

  var [state, setState] = useState(initialState);
  var [applying, setApplying] = useState(false);
  var [rowErrors, setRowErrors] = useState({});
  var [showSkipped, setShowSkipped] = useState(false);
  var [touched, setTouched] = useState(false);
  var [confirmCancel, setConfirmCancel] = useState(false);
  var [userRows, setUserRows] = useState([]);
  var [titleDraft, setTitleDraft] = useState(suggestedTitle || "");
  var [dismissedPeople, setDismissedPeople] = useState([]);
  var [sessionProjects, setSessionProjects] = useState([]);
  var [confidenceBannerDismissed, setConfidenceBannerDismissed] = useState(false);
  var [creatingProject, setCreatingProject] = useState({});  // { [idx]: true } while in-flight
  // Progressive disclosure: rows render as a scannable one-liner by default;
  // the full editing surface (assignee, due, account routing, project, source)
  // is revealed per-row on demand. Keeps the review fast to skim instead of a
  // wall of controls. { [idx]: true } when expanded.
  var [expandedRows, setExpandedRows] = useState({});
  function toggleExpand(idx) {
    setExpandedRows(function (p) { var n = Object.assign({}, p); n[idx] = !n[idx]; return n; });
  }
  // "What Pip used" is reassurance, not a primary decision — collapsed by default.
  var [showReceipts, setShowReceipts] = useState(false);

  function patch(idx, fields) {
    setTouched(true);
    setState(function (prev) {
      var next = prev.slice();
      next[idx] = Object.assign({}, next[idx], fields);
      return next;
    });
  }

  function addUserRow() {
    setTouched(true);
    var rid = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : ("u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    setUserRows(function (prev) {
      return prev.concat([{ id: rid, title: "", assignee: null, recipient: null, due_date: null, targetAccountId: null }]);
    });
  }
  function patchUserRow(rid, fields) {
    setTouched(true);
    setUserRows(function (prev) {
      return prev.map(function (r) { return r.id === rid ? Object.assign({}, r, fields) : r; });
    });
  }
  function removeUserRow(rid) {
    setTouched(true);
    setUserRows(function (prev) { return prev.filter(function (r) { return r.id !== rid; }); });
  }

  var grouped = useMemo(function () {
    var changes = [];
    var news    = [];
    var skipped = [];
    (plan || []).forEach(function (row, idx) {
      var entry = { row: row, idx: idx };
      var g = rowGroup(row.kind);
      if (g === "skipped")    skipped.push(entry);
      else if (g === "new")   news.push(entry);
      else                    changes.push(entry);
    });
    return { changes: changes, news: news, skipped: skipped };
  }, [plan]);

  // #3b — Pip's project suggestions. Rows Pip tagged with the same
  // suggested_project_title (≥2) are a proposed new initiative. Surface a
  // banner that, on accept, creates the Gauge project and files those rows
  // under it (sets gaugeProjectId — the same routing the per-row picker uses).
  var projectSuggestions = useMemo(function () {
    if (!onCreateProject) return [];
    var byTitle = {};
    (plan || []).forEach(function (row, idx) {
      if (row.kind !== "new_item" && row.kind !== "new_task") return;
      var t = (row.suggested_project_title || "").trim();
      if (!t) return;
      if (!byTitle[t]) byTitle[t] = [];
      byTitle[t].push(idx);
    });
    return Object.keys(byTitle)
      .filter(function (t) { return byTitle[t].length >= 2; })
      .map(function (t) { return { title: t, idxs: byTitle[t] }; });
  }, [plan, onCreateProject]);

  var [suggestedCreated, setSuggestedCreated]   = useState({}); // title -> true once created
  var [creatingSuggested, setCreatingSuggested] = useState({}); // title -> true while in-flight

  function createSuggestedProject(sug) {
    if (creatingSuggested[sug.title] || suggestedCreated[sug.title]) return;
    setCreatingSuggested(function (p) { return Object.assign({}, p, { [sug.title]: true }); });
    Promise.resolve(onCreateProject(currentAccountId, { title: sug.title }))
      .then(function (project) {
        setCreatingSuggested(function (p) { var n = Object.assign({}, p); delete n[sug.title]; return n; });
        if (project && project.id) {
          setSessionProjects(function (prev) { return prev.concat([project]); });
          setState(function (prev) {
            var next = prev.slice();
            sug.idxs.forEach(function (i) {
              if (next[i]) next[i] = Object.assign({}, next[i], { gaugeProjectId: project.id, checked: true });
            });
            return next;
          });
          setSuggestedCreated(function (p) { return Object.assign({}, p, { [sug.title]: true }); });
          showToast("Project created — " + sug.idxs.length + " items filed under it");
        }
      })
      .catch(function () {
        setCreatingSuggested(function (p) { var n = Object.assign({}, p); delete n[sug.title]; return n; });
        showToast("Couldn't create project — try again");
      });
  }

  var anyChecked = useMemo(function () {
    var planChecked = state.some(function (s, idx) {
      return s.checked && (plan[idx] && plan[idx].kind !== "skip");
    });
    if (planChecked) return true;
    return userRows.some(function (r) { return (r.title || "").trim().length > 0; });
  }, [state, plan, userRows]);

  function handleApply() {
    if (applying || !anyChecked) return;
    setApplying(true);
    setRowErrors({});

    var selected = [];
    var corrections = [];  // V2 brain — captured fire-and-forget after Apply

    (plan || []).forEach(function (row, idx) {
      if (row.kind === "skip") return;
      var s = state[idx] || {};
      if (s.asProject) return;  // already persisted as a Gauge project
      var originalTitle   = s.initialTitle   || "";
      var originalExcerpt = s.initialExcerpt || "";
      var typed           = (s.title   || "").trim();
      var typedExcerpt    = (s.excerpt || "").trim();
      var titleChanged    = hasEditableTitle(row.kind) && typed && typed !== originalTitle.trim();
      var excerptChanged  = typedExcerpt !== originalExcerpt.trim() && typedExcerpt.length > 0;

      // Rejected row capture — user unchecked it. Reason prefers the edited
      // excerpt (richer signal) but falls back to the original excerpt + a
      // generic "declined" note so Pip at least knows it was wrong.
      if (!s.checked) {
        corrections.push({
          correction_type: "rejected_row",
          meeting_id:      meetingId || null,
          original_value:  {
            kind:           row.kind,
            text:           row.text || (row.fields && row.fields.text) || null,
            title:          row.title || (row.fields && row.fields.title) || null,
            target_id:      row.target_id || null,
            project_id:     row.project_id || null,
            task_id:        row.task_id || null,
            source_excerpt: row.source_excerpt || null,
            confidence:     row.confidence,
          },
          corrected_value: null,
          reason:          typedExcerpt || row.source_excerpt || "declined without note",
        });
        return;
      }

      var merged = Object.assign({}, row);
      if (hasEditableTitle(row.kind) && typed) {
        if (row.kind === "new_item")    merged.text = typed;
        if (row.kind === "new_task")    merged.title = typed;
        if (row.kind === "update_item") merged.fields = Object.assign({}, row.fields, { text: typed });
        if (row.kind === "update_task") merged.fields = Object.assign({}, row.fields, { title: typed });
      }
      if (hasAssignee(row.kind)) {
        merged.assignee = state[idx].assignee || null;
      }
      if (hasDueEdit(row.kind)) {
        merged.due_date = state[idx].due_date || null;
      }
      merged.suggestedAssignee = state[idx].suggestedAssignee || null;
      merged.source_excerpt_edited = typedExcerpt || null;
      if (row.kind === "new_item" || row.kind === "new_task") {
        merged.target_account_id = state[idx].targetAccountId || null;
        merged.recipient = state[idx].recipient || null;
        merged.is_commitment = state[idx].isCommitment || false;
        if (row.kind === "new_task") {
          // The picker is the source of truth for a new_task's project. Empty
          // ("Not in Gauge") clears project_id → applyPipPlan files it as a
          // standalone task instead of a project stage.
          merged.project_id = state[idx].gaugeProjectId || null;
        } else if (state[idx].gaugeProjectId) {
          merged.gaugeProjectId = state[idx].gaugeProjectId;
        }
      }
      selected.push({ idx: idx, row: merged });

      // Routing correction — user changed where Pip wanted to file this row.
      if ((row.kind === "new_item" || row.kind === "new_task") && s.checked) {
        var pipPicked = s.initialTargetAccountId || null;
        var userPicked = s.targetAccountId || null;
        if (pipPicked !== userPicked) {
          corrections.push({
            correction_type: "routed_account_changed",
            meeting_id:      meetingId || null,
            account_id:      currentAccountId || null,
            original_value:  {
              pip_picked: pipPicked,
              text:       row.text || row.title || null,
            },
            corrected_value: {
              actual_account_id:   userPicked,
              actual_account_name: userPicked
                ? ((rosterLookup[userPicked] && rosterLookup[userPicked].name) || userPicked)
                : currentAccountName,
            },
            reason: null,
          });
        }
      }

      // Kept-but-edited capture: Pip's wording was wrong enough that user
      // re-wrote it before applying. High signal for the learning loop.
      if (titleChanged) {
        var ctype = (row.kind === "new_task" || row.kind === "update_task") ? "task_text_edit" : "item_text_edit";
        corrections.push({
          correction_type: ctype,
          meeting_id:      meetingId || null,
          original_value:  {
            kind:           row.kind,
            original:       originalTitle,
            source_excerpt: row.source_excerpt || null,
          },
          corrected_value: { text: typed },
          reason:          excerptChanged ? typedExcerpt : null,
        });
      }
    });

    // User-added rows — items Pip missed entirely. Synthesize as new_item
    // rows so applyPipPlan handles them through the same addItem path, then
    // log each one as a missed_item correction so the V2 brain learns Pip
    // dropped scope.
    var planSnapshot = (plan || []).map(function (r) { return { kind: r.kind, text: r.text || (r.fields && r.fields.text) || null, title: r.title || null }; });
    userRows.forEach(function (ur) {
      var typedTitle = (ur.title || "").trim();
      if (!typedTitle) return;
      var urTargetAccountId = ur.targetAccountId || null;
      var synth = {
        kind:               "new_item",
        text:               typedTitle,
        due_date:           ur.due_date || null,
        assignee:           ur.assignee || null,
        recipient:          ur.recipient || null,
        suggestedAssignee:  null,
        target_account_id:  urTargetAccountId,
        confidence:         "high",  // user wrote it themselves
        source_excerpt_edited: null,
        _userAdded:         true,    // applyPipPlan skips pip_created_at stamp
      };
      selected.push({ idx: "u_" + ur.id, row: synth });
      corrections.push({
        correction_type: "missed_item",
        meeting_id:      meetingId || null,
        account_id:      currentAccountId || null,
        original_value:  {
          pip_plan_count: planSnapshot.length,
          pip_plan_kinds: planSnapshot.map(function (p) { return p.kind; }),
        },
        corrected_value: {
          text:             typedTitle,
          due_date:         ur.due_date || null,
          assignee:         ur.assignee || null,
          target_account_id: urTargetAccountId,
        },
        reason: null,
      });
    });

    if (onLogCorrections && corrections.length) {
      // Fire-and-forget — never block Apply on logging.
      Promise.resolve(onLogCorrections(corrections)).catch(function () { /* swallow */ });
    }

    Promise.resolve(onApply(selected))
      .then(function (result) {
        setApplying(false);
        // Persist the title the user kept/edited regardless of row errors — the
        // meeting was summarized either way, and a partial-error apply shouldn't
        // silently discard the title.
        if (showTitleField && titleDraft && titleDraft.trim() && onTitleSave) {
          onTitleSave(titleDraft.trim());
        }
        if (result && result.errors && Object.keys(result.errors).length) {
          setRowErrors(result.errors);
          showToast("Applied with some errors — check rows below", "warn");
          return;
        }
        var n = selected.length;
        showToast("Applied " + n + " change" + (n === 1 ? "" : "s"));
      })
      .catch(function (err) {
        setApplying(false);
        showToast(err && err.message ? err.message : "Couldn't apply changes");
      });
  }

  // Cancel = dismiss the plan. Notes / summary / meeting are already saved by
  // the caller before this modal opens; we only confirm if the user has touched
  // the plan, otherwise dismiss silently.
  function handleCancelClick() {
    if (touched) { setConfirmCancel(true); return; }
    onCancel();
  }

  function renderRow(entry) {
    var row = entry.row;
    var idx = entry.idx;
    var s   = state[idx] || {};
    var low = row.confidence === "low";
    var titleEdited = hasEditableTitle(row.kind) && (s.title || "") !== (s.initialTitle || "");
    var excerptEdited = (s.excerpt || "") !== (s.initialExcerpt || "");
    var ctx = { existingItems: existingItems, activeProjects: activeProjects };

    // Progressive disclosure. skip rows have nothing to edit — they stay a
    // one-liner. Everything else collapses to a scannable summary + "Edit".
    var expandable = row.kind !== "skip";
    var expanded   = expandable && !!expandedRows[idx];
    var primaryText = hasEditableTitle(row.kind)
      ? (s.title || initialTitle(row) || "(no text)")
      : rowLeader(row, ctx, s.gaugeProjectId);
    // The at-a-glance meta chips shown under the task text when collapsed —
    // only what's set, kept to a short scannable line.
    var collapsedChips = [];
    if (row.kind === "new_task") {
      var ctxProj = findProject(activeProjects, s.gaugeProjectId);
      collapsedChips.push(ctxProj ? ("⊞ " + ctxProj.title) : "Standalone task");
    } else if (row.kind === "new_item") {
      collapsedChips.push("Standalone task");
    } else if (row.kind === "update_item" || row.kind === "update_task") {
      collapsedChips.push("Edit to existing");
    }
    if (s.isCommitment) collapsedChips.push("✦ Commitment");
    if (s.due_date) collapsedChips.push("Due " + fmtDate(s.due_date));
    if ((row.kind === "new_item" || row.kind === "new_task") && s.targetAccountId && s.targetAccountId !== currentAccountId) {
      var routedAcct = rosterLookup[s.targetAccountId];
      collapsedChips.push("→ " + ((routedAcct && routedAcct.name) || "another account"));
    }

    return (
      <div
        key={idx}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          background: C.surface,
          border: "1px solid " + (rowErrors[idx] ? C.red : (s.checked ? C.rule : C.bgDark)),
          borderRadius: 8,
          opacity: row.kind === "skip" || !s.checked ? 0.6 : 1,
          transition: "opacity 0.12s ease, border-color 0.12s ease",
        }}
      >
        {row.kind !== "skip" && (
          <div style={{ marginTop: 4 }}>
            <RowCheckbox
              checked={!!s.checked}
              onChange={function (v) { patch(idx, { checked: v }); }}
              lowConfidence={low}
              ariaLabel={(s.checked ? "Selected: " : "Not selected: ") + rowLeader(row, ctx, s.gaugeProjectId)}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {!expanded && (
            <div
              onClick={expandable ? function () { toggleExpand(idx); } : undefined}
              role={expandable ? "button" : undefined}
              tabIndex={expandable ? 0 : undefined}
              onKeyDown={expandable ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(idx); } } : undefined}
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                cursor: expandable ? "pointer" : "default",
              }}
            >
              <div style={{
                fontSize: 15, color: C.text, lineHeight: 1.4, fontFamily: INTER,
                textDecoration: row.kind === "close_item" ? "line-through" : "none",
                textDecorationColor: C.textMuted,
              }}>
                {primaryText}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, fontSize: 11, fontFamily: INTER }}>
                {collapsedChips.length > 0 && (
                  <span style={{ color: C.textMuted }}>{collapsedChips.join("   ·   ")}</span>
                )}
                {expandable && (
                  <span style={{ color: C.accent, marginLeft: collapsedChips.length ? 6 : 0 }}>▸ Edit</span>
                )}
              </div>
            </div>
          )}
          {expanded && (
          <>
          <div style={{
            fontSize: 11, color: C.textMuted, fontFamily: MONO,
            textTransform: "uppercase", letterSpacing: "0.07em",
            lineHeight: 1.4,
          }}>
            {rowLeader(row, ctx, s.gaugeProjectId)}
          </div>
          {(row.kind === "update_item" || row.kind === "update_task") && (
            <div style={{
              padding: "8px 10px",
              background: C.bgDark,
              border: "1px solid " + C.rule,
              borderRadius: 6,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{
                fontSize: 9, color: C.textMuted, fontFamily: MONO,
                textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
              }}>
                Current
              </div>
              <div style={{
                fontSize: 12, color: C.textMuted, lineHeight: 1.45,
                textDecoration: "line-through",
                textDecorationColor: C.textMuted,
              }}>
                {currentTextForUpdate(row, ctx) || "(empty)"}
              </div>
              <div style={{
                fontSize: 9, color: C.accent, fontFamily: MONO,
                textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
                marginTop: 4,
              }}>
                ↓ Replace with
              </div>
            </div>
          )}
          {hasEditableTitle(row.kind) ? (
            <TitleInput
              value={s.title || ""}
              onChange={function (v) { patch(idx, { title: v }); }}
              edited={titleEdited}
            />
          ) : null}
          {row.kind === "skip" ? null : (
            <SourceExpander
              excerpt={s.excerpt}
              onExcerptChange={function (v) { patch(idx, { excerpt: v }); }}
              edited={excerptEdited}
            />
          )}
          {(row.kind === "new_item" || row.kind === "new_task") && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {rosterOptions.length > 0 && (
                <TargetAccountChip
                  targetAccountId={s.targetAccountId || null}
                  currentAccountName={currentAccountName}
                  hasNoCurrentAccount={!currentAccountId}
                  isPersonCadence={isPersonCadence}
                  rosterOptions={rosterOptions}
                  rosterLookup={rosterLookup}
                  onChange={function (v) { patch(idx, { targetAccountId: v }); }}
                />
              )}
              <button
                type="button"
                onClick={function () { patch(idx, { isCommitment: !s.isCommitment }); }}
                title={s.isCommitment ? "Unmark as commitment" : "Mark as commitment"}
                style={{
                  background: s.isCommitment ? C.accentFaint : "transparent",
                  border: "1px solid " + (s.isCommitment ? C.accentLine : C.border),
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 10,
                  color: s.isCommitment ? C.accent : C.textMuted,
                  cursor: "pointer",
                  fontFamily: MONO,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                {s.isCommitment ? "✦ Commitment" : "◇ Commitment"}
              </button>
              <InfoTip text="Mark as a commitment — something you explicitly promised this account. Pip tracks these separately and flags overdue ones." />
              {onCreateProject && !s.asProject && (
                <button
                  type="button"
                  disabled={!!creatingProject[idx]}
                  onClick={function () {
                    var title = (s.title || row.text || row.title || "").trim();
                    if (!title) return;
                    setCreatingProject(function (prev) { return Object.assign({}, prev, { [idx]: true }); });
                    Promise.resolve(onCreateProject(currentAccountId, { title: title }))
                      .then(function (project) {
                        setCreatingProject(function (prev) { var n = Object.assign({}, prev); delete n[idx]; return n; });
                        if (project && project.id) {
                          setSessionProjects(function (prev) { return prev.concat([project]); });
                        }
                        patch(idx, { asProject: true, checked: false });
                        showToast("Project created — link other items to it ↓");
                      })
                      .catch(function () {
                        setCreatingProject(function (prev) { var n = Object.assign({}, prev); delete n[idx]; return n; });
                        showToast("Couldn't create project — try again");
                      });
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid " + C.rule,
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 10,
                    color: C.textMuted,
                    cursor: creatingProject[idx] ? "default" : "pointer",
                    fontFamily: MONO,
                    display: "inline-flex", alignItems: "center", gap: 4,
                    opacity: creatingProject[idx] ? 0.6 : 1,
                  }}
                >
                  {creatingProject[idx] ? "Creating…" : "→ New project"}
                </button>
              )}
              {onCreateProject && s.asProject && (
                <span style={{
                  background: C.accentFaint,
                  border: "1px solid " + C.accentLine,
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 10,
                  color: C.accent,
                  fontFamily: MONO,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  ⊞ PROJECT
                </span>
              )}
              {onCreateProject && !s.asProject && (sessionProjects.length > 0 || (activeProjects || []).filter(function (p) { return p.status !== "complete"; }).length > 0) && (
                <select
                  value={s.gaugeProjectId || ""}
                  onChange={function (e) { patch(idx, { gaugeProjectId: e.target.value || null }); }}
                  style={{
                    background: s.gaugeProjectId ? C.accentFaint : C.surface,
                    color: s.gaugeProjectId ? C.accent : C.textMuted,
                    border: "1px solid " + (s.gaugeProjectId ? C.accentLine : C.rule),
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 16,
                    fontFamily: MONO,
                    cursor: "pointer",
                  }}
                >
                  <option value="">↳ Not in Gauge</option>
                  {sessionProjects.map(function (p) {
                    return (
                      <option key={p.id} value={p.id}>
                        {"⊞ From this meeting: " + (p.title || "").slice(0, 30)}
                      </option>
                    );
                  })}
                  {(activeProjects || [])
                    .filter(function (p) { return p.status !== "complete"; })
                    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
                    .map(function (p) {
                      return (
                        <option key={p.id} value={p.id}>
                          {"↳ " + (p.title || "").slice(0, 30)}
                        </option>
                      );
                    })}
                </select>
              )}
            </div>
          )}
          {(row.kind === "new_item" || row.kind === "new_task") && (
            <PlanPeopleChip
              title={s.title || ""}
              contacts={accountContacts}
              onAssignee={function (v) { patch(idx, { assignee: v }); }}
              onRecipient={function (v) { patch(idx, { recipient: v }); }}
            />
          )}
          {(hasAssignee(row.kind) || hasDueEdit(row.kind)) && row.kind !== "skip" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {hasAssignee(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Assignee
                  </span>
                  {personField(s.assignee, function (v) { patch(idx, { assignee: v }); })}
                </div>
              )}
              {hasAssignee(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Recipient
                  </span>
                  {personField(s.recipient, function (v) { patch(idx, { recipient: v }); }, "— No recipient —")}
                </div>
              )}
              {hasDueEdit(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Due
                  </span>
                  <DueInput
                    value={s.due_date}
                    onChange={function (v) { patch(idx, { due_date: v }); }}
                  />
                </div>
              )}
            </div>
          )}
          {row.kind === "update_item" && row.fields && row.fields.due_date && (
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: INTER }}>
              Due → {fmtDate(row.fields.due_date)}
            </div>
          )}
          <button
            type="button"
            onClick={function () { toggleExpand(idx); }}
            style={{
              background: "none", border: "none", padding: 0,
              color: C.textMuted, cursor: "pointer",
              fontFamily: INTER, fontSize: 11, alignSelf: "flex-start",
            }}
          >
            ▾ Done editing
          </button>
          </>
          )}
          {rowErrors[idx] && (
            <div style={{ fontSize: 11, color: C.red }}>{rowErrors[idx]}</div>
          )}
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
          flexShrink: 0, marginTop: 2,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, color: low ? C.yellow : C.textMuted,
            letterSpacing: "0.07em", textTransform: "uppercase",
          }}>
            {row.confidence}
          </div>
          {((row.project_id && discussedProjectIds.indexOf(row.project_id) !== -1) ||
            (row.target_id  && discussedItemIds.indexOf(row.target_id)    !== -1)) && (
            <span style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 6, padding: "2px 6px",
              fontSize: 9, color: C.accent, fontFamily: MONO,
              whiteSpace: "nowrap",
            }}>✦ Discussed</span>
          )}
        </div>
      </div>
    );
  }

  function GroupHeader(props) {
    return (
      <div style={{
        fontFamily: MONO, fontSize: 10, color: C.textMuted,
        fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8, marginTop: props.first ? 0 : 14,
      }}>
        {props.children}
      </div>
    );
  }

  function renderUserRow(ur) {
    return (
      <div
        key={ur.id}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          background: C.surface,
          border: "1px dashed " + C.accent,
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            fontSize: 11, color: C.accent, fontFamily: MONO,
            textTransform: "uppercase", letterSpacing: "0.07em",
            lineHeight: 1.4, fontWeight: 700,
          }}>
            You added — Pip missed this
          </div>
          <TitleInput
            value={ur.title || ""}
            onChange={function (v) { patchUserRow(ur.id, { title: v }); }}
            edited={true}
          />
          {rosterOptions.length > 0 && (
            <div>
              <TargetAccountChip
                targetAccountId={ur.targetAccountId || null}
                currentAccountName={currentAccountName}
                hasNoCurrentAccount={!currentAccountId}
                isPersonCadence={isPersonCadence}
                rosterOptions={rosterOptions}
                rosterLookup={rosterLookup}
                onChange={function (v) { patchUserRow(ur.id, { targetAccountId: v }); }}
              />
            </div>
          )}
          <PlanPeopleChip
            title={ur.title || ""}
            contacts={accountContacts}
            onAssignee={function (v) { patchUserRow(ur.id, { assignee: v }); }}
            onRecipient={function (v) { patchUserRow(ur.id, { recipient: v }); }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Assignee
              </span>
              {personField(ur.assignee, function (v) { patchUserRow(ur.id, { assignee: v }); })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Recipient
              </span>
              {personField(ur.recipient, function (v) { patchUserRow(ur.id, { recipient: v }); }, "— No recipient —")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Due
              </span>
              <DueInput
                value={ur.due_date}
                onChange={function (v) { patchUserRow(ur.id, { due_date: v }); }}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={function () { removeUserRow(ur.id); }}
          aria-label="Remove this row"
          title="Remove this row"
          style={{
            background: "none", border: "none", color: C.textMuted,
            cursor: "pointer", padding: "2px 6px", fontSize: 18, lineHeight: 1,
            fontFamily: INTER, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    );
  }

  var showTitleField = !!(suggestedTitle && isDefaultMeetingTitle(meetingTitle));

  var visibleUnknownPeople = (unknownPeople || []).filter(function (p) {
    return dismissedPeople.indexOf(p.name) === -1;
  });

  return (
    <Modal title="Pip's plan" onClose={handleCancelClick} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.accentGlow, border: "1px solid " + C.accentLine, borderRadius: 8,
        }}>
          <PipMark size={8} color={C.accent} glow />
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
            Review each row before applying. Low-confidence rows are unchecked by default —
            uncheck anything you don't want. Tap the title to edit it. <strong>"See source"</strong> opens the
            note that triggered Pip.
          </div>
        </div>

        {(function () {
          var lowCount = (plan || []).filter(function (r) { return r.confidence === "low"; }).length;
          if (lowCount === 0 || confidenceBannerDismissed) return null;
          return (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px",
              background: "rgba(220,160,0,0.10)",
              border: "1px solid " + C.yellow,
              borderRadius: 8,
              gap: 10,
            }}>
              <div style={{ fontSize: 12, color: C.yellow, lineHeight: 1.45, flex: 1 }}>
                <strong>{lowCount} row{lowCount === 1 ? "" : "s"} need a look</strong>
                {" — Pip wasn't sure about " + (lowCount === 1 ? "this one" : "these")}
              </div>
              <button
                type="button"
                onClick={function () { setConfidenceBannerDismissed(true); }}
                aria-label="Dismiss"
                style={{
                  background: "none", border: "none",
                  color: C.yellow, cursor: "pointer",
                  padding: "0 4px", fontSize: 16, lineHeight: 1,
                  flexShrink: 0,
                }}
              >×</button>
            </div>
          );
        })()}

        {showTitleField && (
          <div style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 10, color: C.textMuted, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5,
              fontFamily: MONO,
            }}>
              Meeting title
            </div>
            <input
              value={titleDraft}
              onChange={function (e) {
                setTitleDraft(e.target.value);
                if (onTitleChange) onTitleChange(e.target.value);
              }}
              style={{
                width: "100%",
                background: C.surface,
                border: "1px solid " + C.rule,
                borderRadius: 8, padding: "8px 12px",
                fontSize: 16, color: C.text,
                fontFamily: INTER, boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {(plan || []).length === 0 && (
          <div style={{ fontSize: 13, color: C.textMuted, padding: "8px 0" }}>
            {skippedByPip
              ? "Notes were short — Pip skipped extraction. Add items manually if needed."
              : "Pip didn't find anything to do here."}
          </div>
        )}

        {grouped.changes.length > 0 && (
          <div>
            <GroupHeader first>Changes to existing ({grouped.changes.length})</GroupHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped.changes.map(renderRow)}
            </div>
          </div>
        )}

        {projectSuggestions.filter(function (sug) { return !suggestedCreated[sug.title]; }).map(function (sug) {
          return (
            <div
              key={sug.title}
              style={{
                marginTop: 10,
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 8, padding: "10px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
                  ✦ Pip suggests a project
                </div>
                <div style={{ fontSize: 13.5, color: C.text, fontFamily: INTER, lineHeight: 1.4 }}>
                  <b>{sug.title}</b> — file these {sug.idxs.length} items under one project?
                </div>
              </div>
              <button
                type="button"
                disabled={!!creatingSuggested[sug.title]}
                onClick={function () { createSuggestedProject(sug); }}
                style={{
                  background: C.accentDeep, border: "none", borderRadius: 6,
                  padding: "7px 14px", fontSize: 12, fontWeight: 700, color: C.bg,
                  cursor: creatingSuggested[sug.title] ? "default" : "pointer",
                  opacity: creatingSuggested[sug.title] ? 0.6 : 1,
                  fontFamily: INTER, flexShrink: 0,
                }}
              >
                {creatingSuggested[sug.title] ? "Creating…" : "Create & file"}
              </button>
            </div>
          );
        })}

        {grouped.news.length > 0 && (
          <div>
            <GroupHeader first={grouped.changes.length === 0}>New ({grouped.news.length})</GroupHeader>
            {(function () {
              // Bucket new rows by their INITIAL project routing (stable — the
              // per-row picker can still re-tie without rows jumping around).
              // Headers render only when they inform: a labeled project bucket,
              // or the "no project" bucket when labeled ones exist beside it.
              var buckets = [];
              var byKey = {};
              grouped.news.forEach(function (entry) {
                var pid = entry.row.kind === "new_task" ? (entry.row.project_id || null) : null;
                var proj = pid ? (activeProjects || []).find(function (x) { return x.id === pid; }) : null;
                var key = proj ? proj.id : "_none";
                if (!byKey[key]) {
                  byKey[key] = { label: proj ? (proj.title || "Untitled project") : null, entries: [] };
                  buckets.push(byKey[key]);
                }
                byKey[key].entries.push(entry);
              });
              var hasLabeled = buckets.some(function (b) { return b.label; });
              return buckets.map(function (b, i) {
                var header = b.label || (hasLabeled ? "Not in a project" : null);
                return (
                  <div key={i} style={{ marginBottom: i < buckets.length - 1 ? 12 : 0 }}>
                    {header && (
                      <div style={{
                        fontFamily: MONO, fontSize: 9.5,
                        color: b.label ? C.accent : C.textMuted,
                        letterSpacing: "0.07em", textTransform: "uppercase",
                        margin: "2px 0 6px",
                      }}>
                        {b.label ? "⊞ " + header : header}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {b.entries.map(renderRow)}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {userRows.length > 0 && (
          <div>
            <GroupHeader first={grouped.changes.length === 0 && grouped.news.length === 0}>
              Added by you ({userRows.length})
            </GroupHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {userRows.map(renderUserRow)}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={addUserRow}
          style={{
            background: "none",
            border: "1px dashed " + C.rule,
            borderRadius: 8,
            padding: "10px 12px",
            color: C.textSoft,
            cursor: "pointer",
            fontFamily: INTER, fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginTop: userRows.length > 0 ? 4 : 8,
          }}
        >
          + Add an item Pip missed
        </button>

        {grouped.skipped.length > 0 && (
          <div>
            <button
              onClick={function () { setShowSkipped(function (v) { return !v; }); }}
              style={{
                background: "none", border: "none", color: C.textMuted,
                cursor: "pointer", padding: 0,
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginTop: 14, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{showSkipped ? "▾" : "▸"}</span>
              <span>Skipped duplicates ({grouped.skipped.length})</span>
            </button>
            {showSkipped && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {grouped.skipped.map(renderRow)}
              </div>
            )}
          </div>
        )}

        {Array.isArray(receipts) && receipts.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={function () { setShowReceipts(function (v) { return !v; }); }}
              style={{
                background: "none", border: "none", padding: 0,
                fontFamily: MONO, fontSize: 9, color: C.accent,
                letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
              }}
            >
              {showReceipts ? "▾" : "▸"} ✦ What Pip used ({receipts.length})
            </button>
            {showReceipts && (
              <div style={{
                marginTop: 6,
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 8, padding: "8px 12px",
              }}>
                {receipts.map(function (r, i) {
                  return (
                    <div key={i} style={{ fontFamily: INTER, fontSize: 11.5, color: C.textSoft, lineHeight: 1.5 }}>
                      · {r}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {visibleUnknownPeople.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid " + C.rule, paddingTop: 16 }}>
            <div style={{
              fontSize: 10, color: C.textMuted, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase",
              marginBottom: 10, fontFamily: MONO,
            }}>
              People Pip noticed
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleUnknownPeople.map(function (person, i) {
                return (
                  <UnknownPersonRow
                    key={i}
                    person={person}
                    onAdd={function (data) {
                      return Promise.resolve(onAddContact ? onAddContact(data) : null)
                        .then(function () {
                          setDismissedPeople(function (prev) { return prev.concat([person.name]); });
                        });
                    }}
                    onDismiss={function () {
                      setDismissedPeople(function (prev) { return prev.concat([person.name]); });
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {confirmCancel && (
          <div style={{
            padding: "12px 14px",
            background: C.bgDark,
            border: "1px solid " + C.yellow,
            borderRadius: 8,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
              Discard Pip's plan? Your notes and summary are already saved — only the
              proposed item changes go away.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={function () { setConfirmCancel(false); }}
                style={{
                  background: "none", border: "1px solid " + C.rule,
                  borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 600, color: C.textSoft,
                  fontFamily: INTER, cursor: "pointer",
                }}
              >
                Keep editing
              </button>
              <button
                onClick={function () { setConfirmCancel(false); onCancel(); }}
                style={{
                  background: C.red, border: "none",
                  borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 700, color: C.bg,
                  fontFamily: INTER, cursor: "pointer",
                }}
              >
                Discard plan
              </button>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          marginTop: 6, paddingTop: 12, borderTop: "1px solid " + C.rule,
        }}>
          <button
            onClick={handleCancelClick}
            disabled={applying}
            style={{
              background: "none", border: "1px solid " + C.rule,
              borderRadius: 8, padding: "8px 14px",
              fontSize: 12, fontWeight: 600, color: C.textSoft,
              fontFamily: INTER, cursor: applying ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !anyChecked}
            style={{
              background: C.accentDeep, border: "none",
              borderRadius: 8, padding: "8px 16px",
              fontSize: 12, fontWeight: 700, color: C.bg,
              fontFamily: INTER,
              cursor: (applying || !anyChecked) ? "default" : "pointer",
              opacity: (applying || !anyChecked) ? 0.5 : 1,
            }}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
