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
//
// This view is the new Gauge entry experience for Admin lens users and an
// optional secondary view for everyone else (toggle in GaugeView header).

import { useState, useMemo } from "react";
import { C } from "../../lib/colors";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

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

export function FlatTaskQueue({ tasks, accounts, projects, userEmail, onOpenProject, showAssigneeChip }) {
  var [subFilter, setSubFilter] = useState("open");
  var [groupByProject, setGroupBy] = useState(false);

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

  // Per-project step total used for "Step 3 of 7" badges on discrete projects.
  // Standing projects (is_standing=true) skip the badge — they have no fixed
  // sequence.
  var projectStepTotals = useMemo(function () {
    var m = {};
    (projects || []).forEach(function (p) {
      if (p.is_standing) return;
      var stages = p.stages || [];
      m[p.id] = stages.length;
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
    // Sort: due date asc (nulls last), then created_at desc
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
        <div style={{ flex: 1, minWidth: 0 }}>
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
              <span
                onClick={function () { if (onOpenProject) onOpenProject(proj.id); }}
                role={onOpenProject ? "button" : undefined}
                style={{
                  color: C.textMuted, background: "transparent",
                  border: "1px solid " + C.rule,
                  padding: "2px 7px", borderRadius: 4,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  fontWeight: 600,
                  cursor: onOpenProject ? "pointer" : "default",
                }}
              >
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
    </div>
  );
}
