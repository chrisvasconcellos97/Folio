import { useState } from "react";
import { C, glass } from "../../../lib/colors";
import { GaugeIcon } from "../../../components/GaugeIcon";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { ProjectModal } from "../../gauge/ProjectModal";
import { pickV } from "../../../lib/metricsUtils";
import { supabase } from "../../../lib/supabase";

var STATUS_COLORS = {
  planned:     "rgba(103,200,249,0.9)",
  in_progress: "rgba(74,155,130,0.9)",
  blocked:     "rgba(224,92,92,0.9)",
  complete:    "rgba(78,222,128,0.9)",
  on_hold:     "rgba(251,191,36,0.9)",
};

var STATUS_LABELS = {
  planned:     "Planned",
  in_progress: "In Progress",
  blocked:     "Blocked",
  complete:    "Complete",
  on_hold:     "On Hold",
};

var PRIORITY_COLORS = {
  high:   C.red,
  medium: C.yellow,
  low:    C.green,
};

var GB     = "rgba(103,200,249,0.12)";
var GB_BDR = "rgba(103,200,249,0.25)";

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

  var inProgress = projects.filter(function (p) { return p.status === "in_progress"; });
  var complete   = projects.filter(function (p) { return p.status === "complete"; });
  var onHold     = projects.filter(function (p) { return p.status === "on_hold"; });
  var blocked    = projects.filter(function (p) { return p.status === "blocked"; });
  var today      = new Date().toISOString().split("T")[0];
  var overdue    = inProgress.filter(function (p) { return p.due_date && p.due_date < today; });
  var highPri    = inProgress.filter(function (p) { return p.priority === "high"; });

  if (inProgress.length === 0 && complete.length > 0) {
    return pickV(seed + "pr0", [
      "All " + complete.length + " project" + (complete.length !== 1 ? "s" : "") + " wrapped up. Nothing active right now.",
      "No active projects — " + complete.length + " completed. Clean slate.",
    ]);
  }

  var parts = [];

  if (blocked.length > 0) {
    parts.push(pickV(seed + "prb", [
      blocked.length + " project" + (blocked.length !== 1 ? "s are" : " is") + " blocked. That needs attention before the next call.",
      blocked.length + " blocked project" + (blocked.length !== 1 ? "s" : "") + " here — worth flagging.",
    ]));
  } else if (overdue.length > 0) {
    parts.push(pickV(seed + "prl", [
      overdue.length + " in-progress project" + (overdue.length !== 1 ? "s are" : " is") + " past the due date. That needs attention.",
      overdue.length + " overdue project" + (overdue.length !== 1 ? "s" : "") + " here — flag it on your next call.",
    ]));
  } else if (highPri.length > 0) {
    parts.push(pickV(seed + "prl", [
      highPri.length + " high-priority project" + (highPri.length !== 1 ? "s" : "") + " in progress. Keep those moving.",
      inProgress.length + " in-progress project" + (inProgress.length !== 1 ? "s" : "") + ", " + highPri.length + " marked high priority.",
    ]));
  } else {
    parts.push(pickV(seed + "prl", [
      inProgress.length + " project" + (inProgress.length !== 1 ? "s" : "") + " in progress for this account.",
      "Tracking " + inProgress.length + " active project" + (inProgress.length !== 1 ? "s" : "") + " in Gauge.",
    ]));
  }

  if (onHold.length > 0) {
    parts.push(pickV(seed + "prs", [
      onHold.length + " on hold — worth checking if those can move.",
      onHold.length + " project" + (onHold.length !== 1 ? "s" : "") + " on hold. Might be worth a conversation.",
    ]));
  } else if (complete.length > 0) {
    parts.push(pickV(seed + "prs", [
      complete.length + " already completed — good track record here.",
      complete.length + " done, " + inProgress.length + " in flight. Good momentum.",
    ]));
  }

  return parts.join(" ");
}

export function ProjectsTab({ projects, accounts, accountId, userId, addProject, updateProject, deleteProject }) {
  var [showAdd, setShowAdd] = useState(false);
  var [editing, setEditing] = useState(null);

  var inProgress = projects.filter(function (p) { return p.status === "in_progress"; });
  var other      = projects.filter(function (p) { return p.status !== "in_progress"; });
  var ordered    = inProgress.concat(other);

  function handleSaveNew(data) {
    return addProject(Object.assign({}, data, { account_id: accountId }));
  }

  function handleSaveEdit(data) {
    var wasNotComplete = editing && editing.status !== "complete";
    var isNowComplete  = data.status === "complete";
    return updateProject(editing.id, data).then(function (result) {
      if (wasNotComplete && isNowComplete && accountId && userId) {
        supabase.from("folio_items").insert([{
          account_id: accountId,
          user_id:    userId,
          text:       "✓ Delivered: " + (data.title || editing.title),
          done:       true,
          closed_at:  new Date().toISOString(),
        }]).then();
      }
      return result;
    });
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
          style={{ background: GB, border: "1px solid " + GB_BDR, borderRadius: 20, padding: "5px 13px", color: "rgba(103,200,249,0.9)", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
        >
          + New Request
        </button>
      </div>

      {projects.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 20px", color: C.textMuted, fontSize: 13, border: "1px dashed " + C.border, borderRadius: 12 }}>
          No projects tracked yet.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {ordered.map(function (p) {
          var dimmed  = p.status === "complete";
          var blocked = p.status === "blocked";
          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              style={Object.assign({}, glass, {
                border: "1px solid " + (blocked ? "rgba(224,92,92,0.3)" : p.status === "in_progress" ? GB_BDR : "rgba(255,255,255,0.06)"),
                borderLeft: blocked ? "3px solid rgba(224,92,92,0.8)" : undefined,
                borderRadius: 10,
                padding: "11px 13px",
                cursor: "pointer",
                opacity: dimmed ? 0.6 : 1,
              })}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: p.description ? 5 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ background: STATUS_COLORS[p.status] + "20", border: "1px solid " + STATUS_COLORS[p.status] + "40", borderRadius: 16, padding: "2px 9px", fontSize: 9, fontWeight: 600, color: STATUS_COLORS[p.status], flexShrink: 0, whiteSpace: "nowrap" }}>
                  {STATUS_LABELS[p.status] || p.status}
                </div>
              </div>

              {p.description && (
                <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                  {p.description}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {p.priority && (
                  <span style={{ fontSize: 10, color: PRIORITY_COLORS[p.priority], display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_COLORS[p.priority], display: "inline-block" }} />
                    {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                  </span>
                )}
                {p.due_date && (
                  <span style={{ fontSize: 10, color: C.textMuted }}>Due · {fmt(p.due_date)}</span>
                )}
                {p.assignee && (
                  <span style={{ fontSize: 10, color: C.textMuted }}>{"Owner: " + p.assignee}</span>
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
