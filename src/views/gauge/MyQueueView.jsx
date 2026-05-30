import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { formatFieldValue, taskStatusLabel } from "../../lib/gaugeFields";
import { TaskDetailPanel } from "./TaskDetailPanel";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

// Live = parent project is in_progress (work allowed). Planning = planned
// or on_hold (parent still being scoped; admin can see it but shouldn't
// start). Per spec: when planning, the admin's task gets a PLANNING /
// ON HOLD chip overriding its own task_status display.
function liveness(project) {
  if (project.status === "in_progress" || project.status === "complete" || project.status === "blocked") return "live";
  if (project.status === "planned" || project.status === "on_hold") return "planning";
  return "live";
}

function planningChip(projectStatus) {
  if (projectStatus === "planned") return { label: "PLANNING", color: C.statusPlanned ? C.statusPlanned.text : C.textMuted, bg: C.statusPlanned ? C.statusPlanned.bg : "transparent" };
  if (projectStatus === "on_hold") return { label: "ON HOLD",  color: C.statusOnHold ? C.statusOnHold.text  : C.yellow,    bg: C.statusOnHold ? C.statusOnHold.bg  : "transparent" };
  return null;
}

// Filter pills for the queue: Live / Planning / All.
var SUBFILTERS = [
  { id: "live",     label: "Live"     },
  { id: "planning", label: "Planning" },
  { id: "all",      label: "All"      },
];

export function MyQueueView({ projects, accounts, members, userEmail, onUpdate, onOpenProject, logCorrection }) {
  var [subFilter, setSubFilter] = useState("live");
  var [groupByProject, setGroupBy] = useState(false);
  var [panelOpen, setPanelOpen] = useState(false);
  var [panelProject, setPanelProject] = useState(null);
  var [panelTask, setPanelTask] = useState(null);
  var [panelIndex, setPanelIndex] = useState(null);

  // Flatten — every task across every project where the assignee matches
  // the current user. Carry parent project context with each row.
  var rows = useMemo(function () {
    var lower = (userEmail || "").toLowerCase();
    var out = [];
    (projects || []).forEach(function (p) {
      (p.stages || []).forEach(function (t, idx) {
        if (!t.assignee_email) return;
        if (t.assignee_email.toLowerCase() !== lower) return;
        if (t.completed_at) return;  // queue is for live work; finished tasks drop off
        out.push({ project: p, task: t, taskIndex: idx });
      });
    });
    return out;
  }, [projects, userEmail]);

  var filtered = useMemo(function () {
    if (subFilter === "all") return rows;
    if (subFilter === "live") return rows.filter(function (r) { return liveness(r.project) === "live"; });
    if (subFilter === "planning") return rows.filter(function (r) { return liveness(r.project) === "planning"; });
    return rows;
  }, [rows, subFilter]);

  // Optional group-by-project — admin working through a single workflow can
  // see all its incoming tasks clustered together.
  var grouped = useMemo(function () {
    if (!groupByProject) return null;
    var map = {};
    filtered.forEach(function (r) {
      var k = r.project.id;
      if (!map[k]) map[k] = { project: r.project, rows: [] };
      map[k].rows.push(r);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }, [filtered, groupByProject]);

  function openTask(row) {
    setPanelProject(row.project);
    setPanelTask(row.task);
    setPanelIndex(row.taskIndex);
    setPanelOpen(true);
  }

  function commitTask(newTask, taskIndex) {
    var p = panelProject;
    var nextTasks = (p.stages || []).map(function (t, i) { return i === taskIndex ? newTask : t; });
    return onUpdate(p.id, { stages: nextTasks });
  }

  function deleteTask(taskIndex) {
    var p = panelProject;
    var nextTasks = (p.stages || []).filter(function (_, i) { return i !== taskIndex; });
    return onUpdate(p.id, { stages: nextTasks });
  }

  function renderRow(row) {
    var p = row.project;
    var t = row.task;
    var acct = t.account_id ? (accounts || []).find(function (a) { return a.id === t.account_id; }) : null;
    var planning = planningChip(p.status);
    var schema = p.custom_field_schema || [];
    var cf = t.custom_fields || {};

    // Surface a couple of bones values inline — priority + due + owner.
    var inlineFields = schema.filter(function (f) {
      return f.key === "priority" || f.key === "due_date" || f.key === "owner";
    });

    return (
      <div
        key={p.id + ":" + row.taskIndex}
        style={{
          background: C.surface,
          border: "1px solid " + C.rule,
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Project context — always visible at top of row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <button
            onClick={function (e) { e.stopPropagation(); onOpenProject(p.id); }}
            title={p.title}
            style={{
              background: "transparent", border: "none",
              fontFamily: MONO, fontSize: 9.5, color: C.accent,
              textTransform: "uppercase", letterSpacing: "0.08em",
              cursor: "pointer", padding: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              minWidth: 0, maxWidth: "100%",
            }}
          >
            {p.title}
          </button>
          {planning && (
            <span style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 700,
              color: planning.color, background: planning.bg,
              border: "1px solid " + planning.color, borderRadius: 999,
              padding: "1px 7px", letterSpacing: "0.08em",
            }}>
              {planning.label}
            </span>
          )}
          {!planning && p.is_standing && (
            <span style={{
              fontFamily: MONO, fontSize: 9, color: C.textMuted,
              background: C.bgDark, border: "1px solid " + C.rule, borderRadius: 999,
              padding: "1px 7px", letterSpacing: "0.08em",
            }}>
              {taskStatusLabel(t.task_status || "intake")}
            </span>
          )}
        </div>

        {/* Title row */}
        <div
          onClick={function () { openTask(row); }}
          role="button"
          tabIndex={0}
          onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTask(row); } }}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: SERIF, fontSize: 15, color: C.text, lineHeight: 1.3,
            }}>
              {t.title || "Untitled task"}
            </div>
            {acct && (
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {acct.name}
              </div>
            )}
          </div>
        </div>

        {/* Inline custom-field readouts */}
        {inlineFields.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {inlineFields.map(function (f) {
              var disp = formatFieldValue(f, cf[f.key], members);
              if (!disp) return null;
              return (
                <span
                  key={f.key}
                  style={{
                    fontFamily: MONO, fontSize: 9.5,
                    color: C.textMuted, background: C.bgDark,
                    border: "1px solid " + C.rule, borderRadius: 4,
                    padding: "1px 7px",
                  }}
                >
                  {f.label}: {disp}
                </span>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            onClick={function (e) { e.stopPropagation(); onOpenProject(p.id); }}
            style={{
              background: "transparent", border: "1px solid " + C.rule,
              borderRadius: 6, color: C.textMuted, fontFamily: MONO,
              fontSize: 10, padding: "3px 8px", cursor: "pointer",
            }}
          >
            View project →
          </button>
          <button
            onClick={function () { openTask(row); }}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 6, color: C.accent, fontFamily: MONO,
              fontSize: 10, padding: "3px 8px", cursor: "pointer",
            }}
          >
            Open
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        {SUBFILTERS.map(function (s) {
          var active = subFilter === s.id;
          return (
            <button
              key={s.id}
              onClick={function () { setSubFilter(s.id); }}
              style={{
                padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                fontFamily: MONO, fontSize: 10,
                background: active ? C.accent : "transparent",
                color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule),
              }}
            >{s.label}</button>
          );
        })}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={function () { setGroupBy(function (g) { return !g; }); }}
            style={{
              background: groupByProject ? C.accentFaint : "transparent",
              border: "1px solid " + (groupByProject ? C.accentLine : C.rule),
              borderRadius: 6, color: groupByProject ? C.accent : C.textMuted,
              fontFamily: MONO, fontSize: 10, padding: "3px 10px",
              cursor: "pointer",
            }}
          >Group by project</button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          color: C.textMuted, fontSize: 13,
        }}>
          {subFilter === "live"     ? "Nothing in your queue right now. Clean board."
          : subFilter === "planning" ? "Nothing in planning for you."
          : "Nothing assigned to you yet."}
        </div>
      )}

      {grouped ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {grouped.map(function (g) {
            return (
              <div key={g.project.id}>
                <div style={{
                  fontFamily: MONO, fontSize: 10, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 6,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span>{g.project.title} · {g.rows.length}</span>
                  <button
                    onClick={function () { onOpenProject(g.project.id); }}
                    style={{
                      background: "transparent", border: "1px solid " + C.rule,
                      borderRadius: 4, color: C.textMuted, fontFamily: MONO,
                      fontSize: 9, padding: "1px 6px", cursor: "pointer",
                    }}
                  >open →</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.rows.map(renderRow)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(renderRow)}
        </div>
      )}

      {panelOpen && panelProject && (
        <TaskDetailPanel
          project={panelProject}
          task={panelTask}
          taskIndex={panelIndex}
          accounts={accounts}
          members={members}
          userEmail={userEmail}
          logCorrection={logCorrection}
          onSave={commitTask}
          onDelete={deleteTask}
          onClose={function () { setPanelOpen(false); setPanelTask(null); setPanelIndex(null); setPanelProject(null); }}
        />
      )}
    </div>
  );
}
