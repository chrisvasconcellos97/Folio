import { useState, useMemo } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { showToast } from "../../components/Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function fmtDate(d) {
  if (!d) return null;
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch (e) { return d; }
}

function findItem(items, id)        { return (items || []).find(function (i) { return i.id === id; }); }
function findProject(projects, id)  { return (projects || []).find(function (p) { return p.id === id; }); }
function findTask(project, taskId)  {
  if (!project || !Array.isArray(project.stages)) return null;
  return project.stages.find(function (t) { return t.id === taskId; });
}

function describeRow(row, ctx) {
  var existingItems  = ctx.existingItems  || [];
  var activeProjects = ctx.activeProjects || [];
  switch (row.kind) {
    case "new_item":   return "New item: " + row.text + (row.due_date ? " · due " + fmtDate(row.due_date) : "");
    case "update_item": {
      var it = findItem(existingItems, row.target_id);
      var label = it ? "\"" + (it.text || "").slice(0, 60) + "\"" : "item " + row.target_id;
      var changes = [];
      if (row.fields.text)     changes.push("text → " + String(row.fields.text).slice(0, 60));
      if (row.fields.due_date) changes.push("due → " + fmtDate(row.fields.due_date));
      return "Update " + label + " · " + (changes.join(" · ") || "no-op");
    }
    case "close_item": {
      var ci = findItem(existingItems, row.target_id);
      var clabel = ci ? "\"" + (ci.text || "").slice(0, 60) + "\"" : "item " + row.target_id;
      return "Close " + clabel + (row.reason ? " — " + row.reason : "");
    }
    case "new_task": {
      var np = findProject(activeProjects, row.project_id);
      var pname = np ? np.title : "project";
      return "New task on " + pname + ": " + row.title + (row.due_date ? " · due " + fmtDate(row.due_date) : "");
    }
    case "update_task": {
      var up = findProject(activeProjects, row.project_id);
      var ut = findTask(up, row.task_id);
      var tlabel = ut ? "\"" + (ut.title || ut.text || "").slice(0, 60) + "\"" : "task " + row.task_id;
      var pname2 = up ? up.title : "project";
      var tchanges = [];
      if (row.fields.title)       tchanges.push("title → " + String(row.fields.title).slice(0, 60));
      if (row.fields.due_date)    tchanges.push("due → " + fmtDate(row.fields.due_date));
      if (row.fields.task_status) tchanges.push("status → " + row.fields.task_status);
      return "Update " + tlabel + " on " + pname2 + " · " + (tchanges.join(" · ") || "no-op");
    }
    case "skip": return "Skip — " + (row.reason || "duplicate");
    default: return row.kind;
  }
}

function rowGroup(kind) {
  if (kind === "skip") return "skipped";
  if (kind === "new_item" || kind === "new_task") return "new";
  return "changes";
}

function hasAssignee(kind) { return kind === "new_item" || kind === "new_task"; }
function hasDueEdit(kind)  { return kind === "new_item" || kind === "new_task"; }

function RowCheckbox({ checked, onChange, lowConfidence }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
      {lowConfidence && (
        <span
          aria-label="Low confidence — double-check"
          title="Low confidence — double-check"
          style={{
            width: 8, height: 8, borderRadius: 99,
            background: C.yellow, flexShrink: 0,
          }}
        />
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={function (e) { onChange(e.target.checked); }}
        style={{ width: 16, height: 16, accentColor: "var(--c-accent)" }}
      />
    </label>
  );
}

function AssigneeSelect({ value, options, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={function (e) { onChange(e.target.value || null); }}
      style={{
        background: C.surface, color: C.text,
        border: "1px solid " + C.rule, borderRadius: 6,
        padding: "4px 8px", fontSize: 11, fontFamily: INTER,
        maxWidth: 180,
      }}
    >
      <option value="">— Unassigned —</option>
      {options.map(function (e) {
        return <option key={e} value={e}>{e}</option>;
      })}
    </select>
  );
}

function DueInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={function (e) { onChange(e.target.value || null); }}
      style={{
        background: C.surface, color: C.text,
        border: "1px solid " + C.rule, borderRadius: 6,
        padding: "4px 8px", fontSize: 11, fontFamily: INTER,
      }}
    />
  );
}

export function PipSummarizePreview({
  plan,
  existingItems,
  activeProjects,
  orgMembers,
  onApply,
  onCancel,
}) {
  var memberEmails = useMemo(function () {
    return (orgMembers || [])
      .map(function (m) { return m.invited_email || m.email || null; })
      .filter(Boolean);
  }, [orgMembers]);

  // Per-row UI state: { checked, assigneeOverride, dueOverride }
  var initialState = useMemo(function () {
    return (plan || []).map(function (r) {
      return {
        checked: r.confidence !== "low",
        assignee: r.suggested_assignee || null,
        suggestedAssignee: r.suggested_assignee || null,
        due_date: hasDueEdit(r.kind) ? (r.due_date || null) : null,
      };
    });
  }, [plan]);

  var [state, setState] = useState(initialState);
  var [applying, setApplying] = useState(false);
  var [rowErrors, setRowErrors] = useState({});  // { idx: msg }
  var [showSkipped, setShowSkipped] = useState(false);

  function patch(idx, fields) {
    setState(function (prev) {
      var next = prev.slice();
      next[idx] = Object.assign({}, next[idx], fields);
      return next;
    });
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

  var anyChecked = useMemo(function () {
    return state.some(function (s, idx) {
      return s.checked && (plan[idx] && plan[idx].kind !== "skip");
    });
  }, [state, plan]);

  function handleApply() {
    if (applying || !anyChecked) return;
    setApplying(true);
    setRowErrors({});

    var selected = [];
    (plan || []).forEach(function (row, idx) {
      if (row.kind === "skip") return;
      if (!state[idx] || !state[idx].checked) return;
      var merged = Object.assign({}, row);
      if (hasAssignee(row.kind)) {
        merged.assignee = state[idx].assignee || null;
      }
      if (hasDueEdit(row.kind)) {
        merged.due_date = state[idx].due_date || null;
      }
      merged.suggestedAssignee = state[idx].suggestedAssignee || null;
      selected.push({ idx: idx, row: merged });
    });

    Promise.resolve(onApply(selected))
      .then(function (result) {
        setApplying(false);
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

  function renderRow(entry) {
    var row = entry.row;
    var idx = entry.idx;
    var s   = state[idx] || {};
    var low = row.confidence === "low";

    return (
      <div
        key={idx}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          background: C.surface,
          border: "1px solid " + (rowErrors[idx] ? C.red : C.rule),
          borderRadius: 8,
        }}
      >
        {row.kind !== "skip" && (
          <RowCheckbox
            checked={!!s.checked}
            onChange={function (v) { patch(idx, { checked: v }); }}
            lowConfidence={low}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
            {describeRow(row, { existingItems: existingItems, activeProjects: activeProjects })}
          </div>
          {(hasAssignee(row.kind) || hasDueEdit(row.kind)) && row.kind !== "skip" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {hasAssignee(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Assignee
                  </span>
                  <AssigneeSelect
                    value={s.assignee}
                    options={memberEmails}
                    onChange={function (v) { patch(idx, { assignee: v }); }}
                  />
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
          {rowErrors[idx] && (
            <div style={{ fontSize: 11, color: C.red }}>{rowErrors[idx]}</div>
          )}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: low ? C.yellow : C.textMuted,
          letterSpacing: "0.07em", textTransform: "uppercase", flexShrink: 0,
          marginTop: 2,
        }}>
          {row.confidence}
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

  return (
    <Modal title="Pip's plan" onClose={onCancel} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.accentGlow, border: "1px solid " + C.accentLine, borderRadius: 8,
        }}>
          <PipMark size={8} color={C.accent} glow />
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
            Review each row before applying. Low-confidence rows are unchecked by default —
            uncheck anything you don't want.
          </div>
        </div>

        {(plan || []).length === 0 && (
          <div style={{ fontSize: 13, color: C.textMuted, padding: "8px 0" }}>
            Pip didn't find anything to do here.
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

        {grouped.news.length > 0 && (
          <div>
            <GroupHeader first={grouped.changes.length === 0}>New ({grouped.news.length})</GroupHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped.news.map(renderRow)}
            </div>
          </div>
        )}

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

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          marginTop: 6, paddingTop: 12, borderTop: "1px solid " + C.rule,
        }}>
          <button
            onClick={onCancel}
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
