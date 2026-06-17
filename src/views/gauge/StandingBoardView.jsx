import { useState } from "react";
import { C } from "../../lib/colors";
import { taskStatusLabel, formatFieldValue } from "../../lib/gaugeFields";
import { autoStatusPatch } from "../../lib/gaugeStatus";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { resolveAssignee } from "../../lib/ownerLabel";
import { HexSignature } from "../../lib/hexMotif";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// Resolve an assignee_email (or contact name stored as text) to a
// display-friendly string. If a member record matches the email, show
// their full_name or email-local-part. Otherwise the stored value is
// already a display-ready contact name — return it as-is.
// Standing project board — columns from project.task_status_columns,
// cards from project.stages. Uses the same TaskDetailPanel for create
// and edit. Tasks group into a "done" lane (or whichever the last column
// is) when completed_at is set, so the kanban and the done flag stay
// consistent visually.
export function StandingBoardView({ project, accounts, members, contacts, aliases, userEmail, onUpdate, logCorrection }) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var [panelTask, setPanelTask]   = useState(null);   // task object or null
  var [panelIndex, setPanelIndex] = useState(null);   // index for edit, null for new
  var [panelOpen, setPanelOpen]   = useState(false);
  var [presetStatus, setPresetStatus] = useState(null); // status when adding from a column

  var columns = project.task_status_columns || ["intake", "in_progress", "done"];
  var tasks   = project.stages || [];

  var lastCol = columns[columns.length - 1];

  function bucketize() {
    var buckets = {};
    columns.forEach(function (c) { buckets[c] = []; });
    tasks.forEach(function (t, idx) {
      // A completed task lands in the terminal ("done") column regardless of
      // its task_status, so marking complete actually moves the card instead of
      // leaving it dimmed in its original lane.
      var col = t.completed_at ? lastCol : (t.task_status || columns[0]);
      if (!buckets[col]) buckets[col] = [];
      buckets[col].push({ task: t, idx: idx });
    });
    return buckets;
  }

  function commitTask(newTask, taskIndex) {
    var nextTasks;
    if (taskIndex == null) {
      var withCol = Object.assign({}, newTask, { task_status: newTask.task_status || presetStatus || columns[0] });
      nextTasks = tasks.concat([withCol]);
    } else {
      nextTasks = tasks.map(function (t, i) { return i === taskIndex ? newTask : t; });
    }
    // Auto-flip project status when the last card completes / one re-opens —
    // same shared helper commitStages uses, so every completion path agrees.
    var payload = { stages: nextTasks };
    var sp = autoStatusPatch(nextTasks, project.status, project.is_standing);
    if (sp) Object.assign(payload, sp);
    return onUpdate(project.id, payload);
  }

  function deleteTask(taskIndex) {
    var nextTasks = tasks.filter(function (_, i) { return i !== taskIndex; });
    return onUpdate(project.id, { stages: nextTasks });
  }

function openNew(forStatus) {
    setPanelTask(null);
    setPanelIndex(null);
    setPresetStatus(forStatus || columns[0]);
    setPanelOpen(true);
  }

  function openEdit(t, idx) {
    setPanelTask(t);
    setPanelIndex(idx);
    setPresetStatus(null);
    setPanelOpen(true);
  }

  var schema = project.custom_field_schema || [];
  var inlineFields = schema.filter(function (f) {
    // Pick a couple of high-signal fields to surface on the card without
    // clutter — priority + due_date + owner are the obvious bones picks.
    return f.key === "priority" || f.key === "due_date" || f.key === "owner";
  });

  var buckets = bucketize();

  return (
    <div>
      <div style={{
        display: "grid",
        // On mobile the kanban stacks vertically so each status column gets
        // full width — no horizontal scroll, every card stays readable.
        gridTemplateColumns: isMobile ? "1fr" : "repeat(" + columns.length + ", minmax(160px, 1fr))",
        gap: 10,
        overflowX: isMobile ? "visible" : "auto",
      }}>
        {columns.map(function (col) {
          var list = buckets[col] || [];
          return (
            <div key={col} style={{
              background: C.surface3 || C.surface2,
              border: "1px solid " + C.rule,
              borderRadius: 8,
              padding: "10px 10px 12px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 120,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 10, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>
                  {taskStatusLabel(col)} · {list.length}
                </div>
                <button
                  onClick={function () { openNew(col); }}
                  title="Add task to this column"
                  style={{
                    background: "transparent", border: "1px solid " + C.rule,
                    borderRadius: 4, color: C.textMuted, cursor: "pointer",
                    fontFamily: MONO, fontSize: 11, padding: "1px 6px", lineHeight: 1,
                  }}
                >+</button>
              </div>

              {list.length === 0 && (
                <div style={{
                  fontFamily: INTER, fontSize: 11, color: C.textFaint,
                  textAlign: "center", padding: "12px 4px",
                  border: "1px dashed " + C.rule, borderRadius: 6,
                }}>
                  Empty
                </div>
              )}

              {list.map(function (row) {
                var t = row.task;
                var done = !!t.completed_at;
                var acct = t.account_id ? (accounts || []).find(function (a) { return a.id === t.account_id; }) : null;
                var cf = t.custom_fields || {};
                return (
                  <div
                    key={row.idx}
                    onClick={function () { openEdit(t, row.idx); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(t, row.idx); } }}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      background: C.surface,
                      border: "1px solid " + C.rule,
                      borderRadius: 6,
                      padding: "8px 10px",
                      cursor: "pointer",
                      opacity: done ? 0.55 : 1,
                    }}
                  >
                    <div style={{
                      fontFamily: INTER, fontSize: 13, color: C.text,
                      textDecoration: done ? "line-through" : "none",
                      marginBottom: 4, lineHeight: 1.3,
                    }}>
                      {t.title || "Untitled task"}
                    </div>
                    {acct && (
                      <div style={{
                        fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}>
                        {acct.name}
                      </div>
                    )}
                    {/* Inline custom-field readouts */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {inlineFields.map(function (f) {
                        var disp = formatFieldValue(f, cf[f.key], members);
                        if (!disp) return null;
                        return (
                          <span
                            key={f.key}
                            style={{
                              fontFamily: MONO, fontSize: 9.5,
                              color: C.textMuted,
                              background: C.bgDark,
                              border: "1px solid " + C.rule,
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            {f.label}: {disp}
                          </span>
                        );
                      })}
                    </div>
                    {t.assignee_email && (
                      <div style={{
                        fontFamily: MONO, fontSize: 9.5, color: C.accent,
                        marginTop: 4,
                      }}>
                        → {resolveAssignee(t.assignee_email, members)}
                      </div>
                    )}
                    {t.recipient && (
                      <div style={{
                        fontFamily: MONO, fontSize: 9.5, color: C.textSoft,
                        marginTop: 2,
                      }}>
                        for: {resolveAssignee(t.recipient, members)}
                      </div>
                    )}
                    <HexSignature />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={function () { openNew(columns[0]); }}
          style={{
            background: C.accentFaint, border: "1px solid " + C.accentLine,
            color: C.accent, borderRadius: 6, padding: "6px 14px",
            fontFamily: MONO, fontSize: 11, cursor: "pointer",
          }}
        >+ New task</button>
      </div>

      {panelOpen && (
        <TaskDetailPanel
          project={project}
          task={panelTask}
          taskIndex={panelIndex}
          accounts={accounts}
          members={members}
          contacts={contacts}
          aliases={aliases}
          userEmail={userEmail}
          logCorrection={logCorrection}
          onSave={commitTask}
          onDelete={deleteTask}
          onClose={function () { setPanelOpen(false); setPanelTask(null); setPanelIndex(null); setPresetStatus(null); }}
        />
      )}
    </div>
  );
}
