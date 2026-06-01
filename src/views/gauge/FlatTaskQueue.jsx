// Gauge V3 Phase 3 — flat task queue.
//
// Reads from folio_tasks (the unified items+tasks home created in Phase 1
// and backfilled in Phase 3). Renders a flat, scannable list sorted by due
// date. Each card shows the task title, the account chip, the project chip
// (if any), a step badge for discrete projects, and the due date.
//
// Lens awareness:
//   - "mine"   sub-filter (default for Admin lens) filters to the current
//              user's assignee_email
//   - "all"    sub-filter shows everything the user has access to
//   - "open"   hides completed tasks

import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

// Resolve assignee_email to a display name using org member records.
// If no member matches (contact name stored directly), return as-is.
function resolveAssignee(emailOrName, members) {
  if (!emailOrName) return null;
  var m = (members || []).find(function (x) {
    return (x.invited_email || x.email || "") === emailOrName;
  });
  if (m) return m.full_name || (m.invited_email || "").split("@")[0] || emailOrName;
  return emailOrName;
}

var SUBFILTERS = [
  { id: "open",  label: "Open" },
  { id: "mine",  label: "Mine" },
  { id: "all",   label: "All"  },
];

function fmtDue(d) {
  if (!d) return null;
  var dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d + "T00:00:00") < new Date(new Date().toDateString());
}

function initial(email) {
  if (!email) return "?";
  var clean = email.split("@")[0];
  return (clean.charAt(0) || "?").toUpperCase();
}

export function FlatTaskQueue({ tasks, accounts, projects, members, userEmail, onOpenProject, showAssigneeChip, onToggleDone }) {
  var [subFilter, setSubFilter] = useState("open");
  var [groupByProject, setGroupBy] = useState(false);
  var [detailTask, setDetailTask] = useState(null);

  var accountsById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { m[a.id] = a; });
    return m;
  }, [accounts]);

  var projectsById = useMemo(function () {
    var m = {};
    (projects || []).forEach(function (p) { m[p.id] = p; });
    return m;
  }, [projects]);

  var projectStepTotals = useMemo(function () {
    var m = {};
    (projects || []).forEach(function (p) {
      if (p.is_standing) return;
      m[p.id] = (p.stages || []).length;
    });
    return m;
  }, [projects]);

  var filtered = useMemo(function () {
    var rows = tasks || [];
    if (subFilter === "open") {
      rows = rows.filter(function (t) { return !t.done; });
    } else if (subFilter === "mine") {
      rows = rows.filter(function (t) { return t.assignee_email === userEmail; });
    }
    rows = rows.slice().sort(function (a, b) {
      var ad = a.due_date || null;
      var bd = b.due_date || null;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      if (ad && bd) {
        if (ad < bd) return -1;
        if (ad > bd) return 1;
      }
      return (a.created_at || "") < (b.created_at || "") ? 1 : -1;
    });
    return rows;
  }, [tasks, subFilter, userEmail]);

  var grouped = useMemo(function () {
    if (!groupByProject) return null;
    var bucket = {};
    var order  = [];
    filtered.forEach(function (t) {
      var key = t.project_id || "__loose__";
      if (!bucket[key]) { bucket[key] = []; order.push(key); }
      bucket[key].push(t);
    });
    return order.map(function (k) {
      return { key: k, label: k === "__loose__" ? "No project" : (projectsById[k] ? projectsById[k].name : "Project"), tasks: bucket[k] };
    });
  }, [filtered, groupByProject, projectsById]);

  function renderCard(t) {
    var acct = t.account_id ? accountsById[t.account_id] : null;
    var proj = t.project_id ? projectsById[t.project_id] : null;
    var overdue = !t.done && isOverdue(t.due_date);
    var stepBadge = null;
    if (proj && !proj.is_standing && projectStepTotals[t.project_id]) {
      var totalSteps = projectStepTotals[t.project_id];
      if (typeof t.parent_step_index === "number") {
        stepBadge = "Step " + (t.parent_step_index + 1) + " of " + totalSteps;
      }
    }
    return (
      <div
        key={t.id}
        style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "12px 14px",
          background: t.done ? "transparent" : C.surface,
          border: "1px solid " + C.rule,
          borderLeft: overdue ? "3px solid " + C.red : ("1px solid " + C.rule),
          borderRadius: 8,
          opacity: t.done ? 0.55 : 1,
        }}
      >
        {/* Completion circle */}
        {onToggleDone && (
          <button
            onClick={function (e) { e.stopPropagation(); onToggleDone(t); }}
            aria-label={t.done ? "Mark incomplete" : "Mark complete"}
            style={{
              flexShrink: 0, marginTop: 3,
              width: 24, height: 24, borderRadius: "50%",
              border: "2px solid " + (t.done ? C.accent : C.rule),
              background: t.done ? C.accent : "transparent",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.bg, fontSize: 12, fontWeight: 700,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            {t.done ? "✓" : ""}
          </button>
        )}

        {/* Tappable body → opens detail modal */}
        <div
          onClick={function () { setDetailTask(t); }}
          role="button"
          tabIndex={0}
          onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailTask(t); } }}
          style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
        >
          <div style={{
            fontFamily: SERIF, fontSize: 15, color: C.text,
            lineHeight: 1.3, fontWeight: 400,
            textDecoration: t.done ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {t.title}
          </div>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 6,
            marginTop: 6, alignItems: "center",
            fontFamily: MONO, fontSize: 10,
          }}>
            {acct && (
              <span style={{
                color: C.textSoft, background: C.accentFaint,
                border: "1px solid " + C.accentLine,
                padding: "2px 7px", borderRadius: 4,
                textTransform: "uppercase", letterSpacing: "0.06em",
                fontWeight: 600,
              }}>
                {acct.name}
              </span>
            )}
            {proj && (
              <span style={{
                color: C.textMuted, background: "transparent",
                border: "1px solid " + C.rule,
                padding: "2px 7px", borderRadius: 4,
                textTransform: "uppercase", letterSpacing: "0.06em",
                fontWeight: 600,
              }}>
                {proj.name}
              </span>
            )}
            {stepBadge && (
              <span style={{ color: C.accent, fontWeight: 700, letterSpacing: "0.04em" }}>
                {stepBadge}
              </span>
            )}
            {t.due_date && (
              <span style={{
                color: overdue ? C.red : C.textMuted,
                fontWeight: overdue ? 700 : 500,
                fontFeatureSettings: '"tnum"',
              }}>
                {overdue ? "OVERDUE · " : ""}{fmtDue(t.due_date)}
              </span>
            )}
            {t.source_meeting_id && (
              <span style={{ color: C.textFaint, fontStyle: "italic" }}>
                from meeting
              </span>
            )}
          </div>
        </div>

        {showAssigneeChip && t.assignee_email && (
          <div
            title={t.assignee_email}
            style={{
              width: 26, height: 26, borderRadius: "50%",
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              color: C.accent, fontFamily: MONO, fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initial(t.assignee_email)}
          </div>
        )}
      </div>
    );
  }

  // Detail modal for a selected task
  var dt = detailTask;
  var dtAcct = dt && dt.account_id ? accountsById[dt.account_id] : null;
  var dtProj = dt && dt.project_id ? projectsById[dt.project_id] : null;
  var dtOverdue = dt && !dt.done && isOverdue(dt.due_date);

  return (
    <div>
      {/* Sub-filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {SUBFILTERS.map(function (f) {
          var active = subFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={function () { setSubFilter(f.id); }}
              style={{
                background: active ? C.accent : "transparent",
                color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule),
                borderRadius: 999, padding: "5px 14px",
                fontFamily: INTER, fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: "pointer", letterSpacing: "0.02em",
              }}
            >
              {f.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={function () { setGroupBy(!groupByProject); }}
          style={{
            background: "transparent",
            color: groupByProject ? C.accent : C.textMuted,
            border: "1px solid " + (groupByProject ? C.accent : C.rule),
            borderRadius: 999, padding: "5px 14px",
            fontFamily: INTER, fontSize: 12, fontWeight: 500,
            cursor: "pointer", letterSpacing: "0.02em",
          }}
        >
          Group by project
        </button>
      </div>

      {/* Task cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px", color: C.textMuted, fontSize: 13 }}>
          {subFilter === "mine" ? "Nothing assigned to you right now."
          : subFilter === "open" ? "Nothing open. Either you're caught up, or nothing has been captured yet."
          : "No tasks here."}
        </div>
      ) : grouped ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {grouped.map(function (g) {
            return (
              <div key={g.key}>
                <div style={{
                  fontFamily: MONO, fontSize: 10, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 6, paddingLeft: 2,
                }}>
                  {g.label} · {g.tasks.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.tasks.map(function (t) { return renderCard(t); })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(function (t) { return renderCard(t); })}
        </div>
      )}

      {/* Task detail modal */}
      {detailTask && (
        <Modal title="Task" onClose={function () { setDetailTask(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Title */}
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.text, lineHeight: 1.4 }}>
              {dt.title}
            </div>

            {/* Fields grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {dtAcct && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Account</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 11, color: C.textSoft,
                    background: C.accentFaint, border: "1px solid " + C.accentLine,
                    padding: "3px 9px", borderRadius: 4,
                    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
                  }}>
                    {dtAcct.name}
                  </span>
                </div>
              )}

              {dtProj && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Project</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 11, color: C.textMuted,
                    background: "transparent", border: "1px solid " + C.rule,
                    padding: "3px 9px", borderRadius: 4,
                    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
                  }}>
                    {dtProj.name || dtProj.title}
                  </span>
                </div>
              )}

              {dt.due_date && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Due</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 12,
                    color: dtOverdue ? C.red : C.text,
                    fontWeight: dtOverdue ? 700 : 400,
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {dtOverdue ? "OVERDUE · " : ""}{fmtDue(dt.due_date)}
                  </span>
                </div>
              )}

              {dt.assignee_email && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Assigned</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{resolveAssignee(dt.assignee_email, members)}</span>
                </div>
              )}

              {dt.task_status && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Status</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, textTransform: "capitalize" }}>{dt.task_status.replace(/_/g, " ")}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Done</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: dt.done ? C.accent : C.textMuted }}>{dt.done ? "Yes" : "No"}</span>
              </div>

              {dt.source_meeting_id && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", width: 72, flexShrink: 0 }}>Source</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.textFaint, fontStyle: "italic" }}>From meeting</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
              {onToggleDone && (
                <button
                  onClick={function () {
                    onToggleDone(dt);
                    // Optimistically update the detailTask view so Done row flips
                    setDetailTask(Object.assign({}, dt, { done: !dt.done }));
                  }}
                  style={{
                    flex: 1, minWidth: 120,
                    padding: "10px 16px", borderRadius: 8, cursor: "pointer",
                    fontFamily: INTER, fontSize: 13, fontWeight: 600,
                    background: dt.done ? C.surface : C.accent,
                    color: dt.done ? C.text : C.bg,
                    border: "1px solid " + (dt.done ? C.rule : C.accent),
                  }}
                >
                  {dt.done ? "Mark incomplete" : "Mark complete"}
                </button>
              )}

              {dtProj && onOpenProject && (
                <button
                  onClick={function () {
                    setDetailTask(null);
                    onOpenProject(dtProj.id);
                  }}
                  style={{
                    flex: 1, minWidth: 120,
                    padding: "10px 16px", borderRadius: 8, cursor: "pointer",
                    fontFamily: INTER, fontSize: 13, fontWeight: 500,
                    background: "transparent",
                    color: C.accent,
                    border: "1px solid " + C.accentLine,
                  }}
                >
                  View project →
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
