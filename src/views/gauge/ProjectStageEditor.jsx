import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskEntityDetector } from "../../components/TaskEntityDetector";
import { autoStatusPatch } from "../../lib/gaugeStatus";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

function fmt(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StageIcon({ stage, onClick }) {
  var done    = !!stage.completed_at;
  var blocked = stage.blocked_reason !== null && stage.blocked_reason !== undefined;
  var color   = blocked ? C.red : done ? C.green : C.textMuted;
  var glyph   = blocked ? "⊘" : done ? "✓" : "○";
  return (
    <span
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: "50%",
        border: "1.5px solid " + color,
        color: color,
        fontSize: 12, lineHeight: 1, fontWeight: 700,
        cursor: "pointer", flexShrink: 0, userSelect: "none",
        background: done ? C.greenFaint || "transparent" : "transparent",
      }}
      aria-label={blocked ? "Blocked stage — click to clear" : done ? "Completed — click to undo" : "Mark stage complete"}
    >
      {glyph}
    </span>
  );
}

function SubStageIcon({ sub, onClick }) {
  var done = !!sub.completed_at;
  return (
    <span
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: 3,
        border: "1.5px solid " + (done ? C.green : C.textMuted),
        color: done ? C.green : "transparent",
        fontSize: 10, lineHeight: 1, fontWeight: 700,
        cursor: "pointer", flexShrink: 0, userSelect: "none",
      }}
    >
      ✓
    </span>
  );
}

export function ProjectStageEditor({ project, onUpdate, accounts, members, contacts, aliases, userEmail, logCorrection }) {
  var [expanded, setExpanded] = useState({});
  var [newStageTitle, setNewStageTitle] = useState("");
  var [addingSub, setAddingSub] = useState({}); // { stageIdx: "title text" }
  var [detailIdx, setDetailIdx] = useState(null);
  var [showNewDetail, setShowNewDetail] = useState(false);
  var [lastAddedIdx, setLastAddedIdx] = useState(null);
  // Optimistic local stages — applied immediately on mutations, cleared when DB confirms via prop update.
  var [localStages, setLocalStages] = useState(null);
  useEffect(function () { setLocalStages(null); }, [project.stages]);

  var stages = localStages !== null ? localStages : (project.stages || []);
  var hasSchema = (project.custom_field_schema || []).length > 0;

  function commitStages(next) {
    // Auto-flip project status when all stages are complete / any stage is
    // unchecked. Shared helper so every completion path agrees.
    var payload = { stages: next };
    var sp = autoStatusPatch(next, project.status, project.is_standing);
    if (sp) Object.assign(payload, sp);
    return onUpdate(project.id, payload);
  }

  function toggleStageComplete(idx) {
    var next = stages.map(function (s, i) {
      if (i !== idx) return s;
      // Can't toggle complete on a blocked stage — clear blocker first
      if (s.blocked_reason !== null && s.blocked_reason !== undefined) return s;
      return Object.assign({}, s, { completed_at: s.completed_at ? null : new Date().toISOString() });
    });
    commitStages(next);
  }

  function toggleStageBlocked(idx) {
    var next = stages.map(function (s, i) {
      if (i !== idx) return s;
      var becomingBlocked = !(s.blocked_reason !== null && s.blocked_reason !== undefined);
      return Object.assign({}, s, {
        blocked_reason: becomingBlocked ? "" : null,
        completed_at: becomingBlocked ? null : s.completed_at,
      });
    });
    commitStages(next);
    if (!(stages[idx].blocked_reason !== null && stages[idx].blocked_reason !== undefined)) {
      setExpanded(function (prev) { return Object.assign({}, prev, { [idx]: true }); });
    }
  }

  function updateBlockedReason(idx, text) {
    var next = stages.map(function (s, i) {
      return i === idx ? Object.assign({}, s, { blocked_reason: text }) : s;
    });
    commitStages(next);
  }

  function toggleSub(stageIdx, subIdx) {
    var next = stages.map(function (s, i) {
      if (i !== stageIdx) return s;
      var subs = (s.sub_stages || []).map(function (sub, j) {
        return j === subIdx ? Object.assign({}, sub, { completed_at: sub.completed_at ? null : new Date().toISOString() }) : sub;
      });
      return Object.assign({}, s, { sub_stages: subs });
    });
    commitStages(next);
  }

  function addStage() {
    var t = newStageTitle.trim();
    if (!t) return;
    var next = stages.concat([{ title: t, completed_at: null, is_external: false, blocked_reason: null, sub_stages: [] }]);
    var newIdx = next.length - 1;
    setNewStageTitle("");
    commitStages(next);
    setLastAddedIdx(newIdx);
  }

  function addSub(stageIdx) {
    var t = (addingSub[stageIdx] || "").trim();
    if (!t) return;
    var next = stages.map(function (s, i) {
      if (i !== stageIdx) return s;
      var subs = (s.sub_stages || []).concat([{ title: t, completed_at: null }]);
      return Object.assign({}, s, { sub_stages: subs });
    });
    setAddingSub(function (prev) { var n = Object.assign({}, prev); delete n[stageIdx]; return n; });
    commitStages(next);
  }

  function removeStage(idx) {
    var next = stages.filter(function (_, i) { return i !== idx; });
    commitStages(next);
  }

  function acceptStageSuggestion(idx, suggestion, kind) {
    var contactVal = suggestion.type !== "account"
      ? (suggestion.contact.email || suggestion.contact.name || "")
      : "";
    var patch = suggestion.type === "account"
      ? { account_id: suggestion.account.id }
      : (kind === "recipient" ? { recipient: contactVal } : { assignee_email: contactVal });
    // Read from the optimistic `stages` (localStages ?? project.stages), not
    // project.stages directly, or unsaved stage edits get discarded.
    var next = (stages || []).map(function (s, i) { return i === idx ? Object.assign({}, s, patch) : s; });
    setLocalStages(next); // optimistic — detail panel sees it immediately
    commitStages(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {stages.map(function (s, idx) {
        var blocked    = s.blocked_reason !== null && s.blocked_reason !== undefined;
        var done       = !!s.completed_at;
        var subs       = s.sub_stages || [];
        var subsDone   = subs.filter(function (x) { return x.completed_at; }).length;
        var isExpanded = !!expanded[idx];
        var statusText = blocked ? "blocked" : done ? "done · " + new Date(s.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                       : subs.length > 0 && subsDone > 0 ? "in progress · " + Math.round((subsDone / subs.length) * 100) + "%"
                       : "planned";

        return (
          <div key={idx} style={{
            background: C.surface3 || "rgba(0,0,0,0.18)",
            border: "1px solid " + (blocked ? C.redLine : C.rule),
            borderRadius: 8, padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StageIcon stage={s} onClick={function () { toggleStageComplete(idx); }} />
              <div
                onClick={function () { if (subs.length > 0) setExpanded(function (prev) { return Object.assign({}, prev, { [idx]: !prev[idx] }); }); }}
                style={{
                  flex: 1, minWidth: 0, fontFamily: INTER, fontSize: 13, color: C.text,
                  textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1,
                  cursor: subs.length > 0 ? "pointer" : "default",
                }}
              >
                {s.title}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: blocked ? C.red : C.textMuted, textTransform: "lowercase" }}>
                {statusText}
              </div>
              {s.assignee_email && (
                <div style={{
                  fontFamily: MONO, fontSize: 9, color: C.accent,
                  background: C.accentFaint, border: "1px solid " + C.accentLine,
                  borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap",
                }}>
                  {s.assignee_email.includes("@") ? s.assignee_email.split("@")[0] : s.assignee_email}
                </div>
              )}
              {s.recipient && (
                <div
                  title={"For: " + s.recipient}
                  style={{
                    fontFamily: MONO, fontSize: 9, color: C.textSoft,
                    border: "1px solid " + C.rule,
                    borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap",
                  }}
                >
                  → {s.recipient.includes("@") ? s.recipient.split("@")[0] : s.recipient}
                </div>
              )}
              {subs.length > 0 && (
                <button
                  onClick={function () { setExpanded(function (prev) { return Object.assign({}, prev, { [idx]: !prev[idx] }); }); }}
                  style={{
                    background: "none", border: "none", color: C.textMuted, cursor: "pointer",
                    fontSize: 12, padding: "2px 4px",
                  }}
                  aria-label={isExpanded ? "Collapse sub-tasks" : "Expand sub-tasks"}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              )}
              <button
                onClick={function () { toggleStageBlocked(idx); }}
                title={blocked ? "Clear blocker" : "Mark blocked"}
                style={{
                  background: "none", border: "1px solid " + (blocked ? C.red : C.rule),
                  borderRadius: 4, color: blocked ? C.red : C.textMuted,
                  fontSize: 10, padding: "2px 6px", cursor: "pointer",
                  fontFamily: MONO,
                }}
              >
                ⊘
              </button>
              <button
                onClick={function () { setDetailIdx(idx); }}
                title="Open task details"
                style={{
                  background: "none", border: "1px solid " + C.rule,
                  borderRadius: 4, color: C.textMuted,
                  fontSize: 11, padding: "2px 7px", cursor: "pointer",
                  fontFamily: MONO, lineHeight: 1,
                }}
              >
                ⋯
              </button>
              <button
                onClick={function () { removeStage(idx); }}
                title="Remove stage"
                style={{
                  background: "none", border: "none", color: C.textMuted, cursor: "pointer",
                  fontSize: 14, padding: "2px 4px",
                }}
              >
                ×
              </button>
            </div>

            {lastAddedIdx === idx && (
              <TaskEntityDetector
                task={s}
                contacts={contacts}
                accounts={accounts}
                aliases={aliases}
                onAccept={function (suggestion, kind) { acceptStageSuggestion(idx, suggestion, kind); setLastAddedIdx(null); }}
                onDismiss={function () { setLastAddedIdx(null); }}
              />
            )}

            {blocked && (
              <textarea
                value={s.blocked_reason || ""}
                onChange={function (e) { updateBlockedReason(idx, e.target.value); }}
                placeholder="What's blocking this?"
                rows={2}
                style={{
                  width: "100%", marginTop: 6,
                  background: C.surface, border: "1px solid " + C.redLine,
                  borderRadius: 6, padding: "6px 8px",
                  fontFamily: INTER, fontSize: 12, color: C.text,
                  resize: "vertical",
                }}
              />
            )}

            {isExpanded && subs.length > 0 && (
              <div style={{ marginTop: 8, marginLeft: 28, display: "flex", flexDirection: "column", gap: 5 }}>
                {subs.map(function (sub, j) {
                  return (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SubStageIcon sub={sub} onClick={function () { toggleSub(idx, j); }} />
                      <span style={{
                        fontFamily: INTER, fontSize: 12, color: C.textSoft,
                        textDecoration: sub.completed_at ? "line-through" : "none",
                        opacity: sub.completed_at ? 0.55 : 1,
                      }}>
                        {sub.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {isExpanded && (
              <div style={{ marginTop: 8, marginLeft: 28, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  value={addingSub[idx] || ""}
                  onChange={function (e) {
                    var v = e.target.value;
                    setAddingSub(function (prev) { return Object.assign({}, prev, { [idx]: v }); });
                  }}
                  onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addSub(idx); } }}
                  placeholder="+ Add sub-step"
                  style={{
                    flex: 1, background: C.surface, border: "1px solid " + C.rule,
                    borderRadius: 6, padding: "4px 8px",
                    fontFamily: INTER, fontSize: 11, color: C.text,
                  }}
                />
                {addingSub[idx] && (
                  <button
                    onClick={function () { addSub(idx); }}
                    style={{
                      background: C.accentFaint, border: "1px solid " + C.accentLine,
                      color: C.accent, borderRadius: 6, padding: "4px 10px",
                      fontFamily: MONO, fontSize: 10, cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <input
          type="text"
          value={newStageTitle}
          onChange={function (e) { setNewStageTitle(e.target.value); }}
          onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addStage(); } }}
          placeholder="+ Add task"
          style={{
            flex: 1, background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 6, padding: "6px 10px",
            fontFamily: INTER, fontSize: 12, color: C.text,
          }}
        />
        {newStageTitle.trim() && (
          <button
            onClick={addStage}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              color: C.accent, borderRadius: 6, padding: "6px 12px",
              fontFamily: MONO, fontSize: 11, cursor: "pointer",
            }}
          >
            Add task
          </button>
        )}
        {hasSchema && (
          <button
            onClick={function () { setShowNewDetail(true); }}
            title="Add task with full details"
            style={{
              background: "transparent", border: "1px solid " + C.rule,
              color: C.textMuted, borderRadius: 6, padding: "6px 10px",
              fontFamily: MONO, fontSize: 10, cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            + with details
          </button>
        )}
      </div>

      {showNewDetail && (
        <TaskDetailPanel
          project={project}
          task={null}
          taskIndex={null}
          accounts={accounts}
          members={members}
          contacts={contacts}
          aliases={aliases}
          userEmail={userEmail}
          logCorrection={logCorrection}
          onSave={function (taskShape) {
            var next = stages.concat([taskShape]);
            return commitStages(next).then(function () { setShowNewDetail(false); });
          }}
          onClose={function () { setShowNewDetail(false); }}
        />
      )}

      {detailIdx !== null && stages[detailIdx] && (
        <TaskDetailPanel
          project={project}
          task={stages[detailIdx]}
          taskIndex={detailIdx}
          accounts={accounts}
          members={members}
          contacts={contacts}
          aliases={aliases}
          userEmail={userEmail}
          logCorrection={logCorrection}
          onSave={function (taskShape) {
            var next = stages.map(function (s, i) { return i === detailIdx ? taskShape : s; });
            return commitStages(next).then(function () { setDetailIdx(null); });
          }}
          onDelete={function () {
            var next = stages.filter(function (_, i) { return i !== detailIdx; });
            return commitStages(next).then(function () { setDetailIdx(null); });
          }}
          onClose={function () { setDetailIdx(null); }}
        />
      )}
    </div>
  );
}
