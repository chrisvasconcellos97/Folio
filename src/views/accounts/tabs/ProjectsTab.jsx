import { useState } from "react";
import { C } from "../../../lib/colors";
import { GaugeIcon } from "../../../components/GaugeIcon";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { ProjectModal } from "../../gauge/ProjectModal";
import { pickV } from "../../../lib/metricsUtils";

var STATUS_COLORS = {
  active:    C.blue,
  on_hold:   C.yellow,
  completed: C.green,
  cancelled: C.textMuted,
};

var STATUS_LABELS = {
  active:    "Active",
  on_hold:   "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

var PRIORITY_COLORS = {
  high:   C.red,
  medium: C.yellow,
  low:    C.green,
};

var GB_BDR = "rgba(123,108,246,0.2)";

function fmt(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildProjectsInsight(projects, accountId) {
  var seed = (accountId || "x") + new Date().getDate().toString();

  if (projects.length === 0) {
    return pickV(seed + "pr0", [
      "No projects tracked yet. Commitments from meetings can live here once they need real tracking.",
      "Nothing in Gauge for this account yet. Use this for anything that turns into a deliverable.",
    ]);
  }

  var active    = projects.filter(function (p) { return p.status === "active"; });
  var completed = projects.filter(function (p) { return p.status === "completed"; });
  var onHold    = projects.filter(function (p) { return p.status === "on_hold"; });
  var today     = new Date().toISOString().split("T")[0];
  var overdue   = active.filter(function (p) { return p.due_date && p.due_date < today; });
  var highPri   = active.filter(function (p) { return p.priority === "high"; });

  if (active.length === 0 && completed.length > 0) {
    return pickV(seed + "pr0", [
      "All " + completed.length + " project" + (completed.length !== 1 ? "s" : "") + " wrapped up. Nothing active right now.",
      "No active projects — " + completed.length + " completed. Clean slate.",
    ]);
  }

  var parts = [];

  // Lead
  if (overdue.length > 0) {
    parts.push(pickV(seed + "prl", [
      overdue.length + " active project" + (overdue.length !== 1 ? "s are" : " is") + " past the due date. That needs attention.",
      overdue.length + " overdue project" + (overdue.length !== 1 ? "s" : "") + " here — flag it on your next call.",
    ]));
  } else if (highPri.length > 0) {
    parts.push(pickV(seed + "prl", [
      highPri.length + " high-priority project" + (highPri.length !== 1 ? "s" : "") + " active. Keep those moving.",
      active.length + " active project" + (active.length !== 1 ? "s" : "") + ", " + highPri.length + " marked high priority.",
    ]));
  } else {
    parts.push(pickV(seed + "prl", [
      active.length + " active project" + (active.length !== 1 ? "s" : "") + " for this account.",
      "Tracking " + active.length + " project" + (active.length !== 1 ? "s" : "") + " in Gauge.",
    ]));
  }

  // Secondary
  if (onHold.length > 0) {
    parts.push(pickV(seed + "prs", [
      onHold.length + " on hold — worth checking if those can move.",
      onHold.length + " project" + (onHold.length !== 1 ? "s" : "") + " on hold. Might be worth a conversation.",
    ]));
  } else if (completed.length > 0) {
    parts.push(pickV(seed + "prs", [
      completed.length + " already completed — good track record here.",
      completed.length + " done, " + active.length + " in flight. Good momentum.",
    ]));
  }

  return parts.join(" ");
}

export function ProjectsTab({ projects, accounts, accountId, addProject, updateProject, deleteProject }) {
  var [showAdd, setShowAdd] = useState(false);
  var [editing, setEditing] = useState(null);

  var active   = projects.filter(function (p) { return p.status === "active"; });
  var inactive = projects.filter(function (p) { return p.status !== "active"; });
  var ordered  = active.concat(inactive);

  function handleSaveNew(data) {
    return addProject(Object.assign({}, data, { account_id: accountId }));
  }

  function handleSaveEdit(data) {
    return updateProject(editing.id, data);
  }

  return (
    <div>
      <PipInsightCard text={buildProjectsInsight(projects, accountId)} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GaugeIcon size={20} />
          <div style={{ fontSize: 12, color: C.blue, fontWeight: 600, letterSpacing: "0.06em" }}>
            Gauge Projects
          </div>
        </div>

        <button
          onClick={function () { setShowAdd(true); }}
          style={{ background: "rgba(123,108,246,0.1)", border: "1px solid " + GB_BDR, borderRadius: 20, padding: "5px 13px", color: C.blue, fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
        >
          + Add to Gauge
        </button>
      </div>

      {projects.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 20px", color: C.textMuted, fontSize: 13, border: "1px dashed " + C.border, borderRadius: 12 }}>
          No projects tracked yet.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {ordered.map(function (p) {
          var dimmed = p.status === "completed" || p.status === "cancelled";
          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              style={{ background: C.bgCard, border: "1px solid " + (p.status === "active" ? GB_BDR : C.border), borderRadius: 10, padding: "11px 13px", cursor: "pointer", opacity: dimmed ? 0.6 : 1 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: p.description ? 5 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ background: STATUS_COLORS[p.status] + "20", border: "1px solid " + STATUS_COLORS[p.status] + "40", borderRadius: 16, padding: "2px 9px", fontSize: 9, fontWeight: 600, color: STATUS_COLORS[p.status], flexShrink: 0, whiteSpace: "nowrap" }}>
                  {STATUS_LABELS[p.status]}
                </div>
              </div>

              {p.description && (
                <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                  {p.description}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {p.priority && (
                  <span style={{ fontSize: 10, color: PRIORITY_COLORS[p.priority], display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_COLORS[p.priority], display: "inline-block" }} />
                    {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                  </span>
                )}
                {p.due_date && (
                  <span style={{ fontSize: 10, color: C.textMuted }}>Due · {fmt(p.due_date)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <ProjectModal
          accounts={accounts}
          onSave={handleSaveNew}
          onClose={function () { setShowAdd(false); }}
        />
      )}

      {editing && (
        <ProjectModal
          existing={editing}
          accounts={accounts}
          onSave={handleSaveEdit}
          onDelete={deleteProject}
          onClose={function () { setEditing(null); }}
        />
      )}
    </div>
  );
}
