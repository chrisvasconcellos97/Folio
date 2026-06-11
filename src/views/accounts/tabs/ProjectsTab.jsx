import { useState } from "react";
import { C, glass } from "../../../lib/colors";
import { GaugeIcon } from "../../../components/GaugeIcon";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { ProjectModal } from "../../gauge/ProjectModal";
import { pickV } from "../../../lib/metricsUtils";
import { supabase } from "../../../lib/supabase";
import { fmtShort } from "../../../lib/dateUtils";
import { gaugeStatusLabel, gaugeStatusToken } from "../../../lib/gaugeStatus";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

// Status label + pill colors come from the shared GAUGE_STATUS_CONFIG so the
// account Projects tab, Gauge, and the Leader rollup never drift (App
// Coherence Rule). gaugeStatusToken returns the {bg,text,border} token.

var PRIORITY_COLORS = {
  high:   C.red,
  medium: C.yellow,
  low:    C.green,
};

var GB     = C.statusPlanned.bg;      // faint blue fill
var GB_BDR = C.statusPlanned.border;  // blue border

function fmt(dateStr) {
  if (!dateStr) return null;
  return fmtShort(dateStr);
}

function countExternal(stages) {
  if (!stages || stages.length === 0) return 0;
  return stages.filter(function (s) { return s.is_external && !s.completed_at; }).length;
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
    // Ensure account_id is always set for ProjectsTab context
    return addProject(Object.assign({}, data, {
      account_id: accountId,
      account_ids: data.account_ids && data.account_ids.length > 0
        ? data.account_ids
        : [accountId],
    }));
  }

  function handleSaveEdit(data) {
    var wasNotComplete = editing && editing.status !== "complete";
    var isNowComplete  = data.status === "complete";
    return updateProject(editing.id, data).then(function (result) {
      if (wasNotComplete && isNowComplete && accountId && userId) {
        supabase.from("folio_tasks").insert([{
          account_id: accountId,
          user_id:    userId,
          title:      "✓ Delivered: " + (data.title || editing.title),
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
          style={{ background: GB, border: "1px solid " + GB_BDR, borderRadius: 20, padding: "5px 13px", color: C.statusPlanned.text, fontSize: 11, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer" }}
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
          var dimmed   = p.status === "complete";
          var blocked  = p.status === "blocked";
          var extCount = countExternal(p.stages || []);
          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              style={Object.assign({}, glass, {
                border: "1px solid " + (blocked ? C.statusBlocked.border : p.status === "in_progress" ? GB_BDR : "rgba(255,255,255,0.06)"),
                borderLeft: blocked ? "3px solid " + C.statusBlocked.text : undefined,
                borderRadius: 10,
                padding: "11px 13px",
                cursor: "pointer",
                opacity: dimmed ? 0.6 : 1,
              })}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: (p.description || blocked) ? 5 : 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: C.text, flex: 1, lineHeight: 1.3,
                  textDecoration: dimmed ? "line-through" : "none",
                }}>
                  {p.title}
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                  {/* Scope badge */}
                  {p.scope === "team" && (
                    <div style={{ background: "rgba(77,184,150,0.08)", border: "1px solid rgba(77,184,150,0.2)", borderRadius: 999, padding: "1px 7px", fontFamily: MONO, fontSize: 8, color: C.accent, letterSpacing: "0.08em" }}>
                      TEAM
                    </div>
                  )}
                  <div style={{ background: gaugeStatusToken(p.status).bg, border: "1px solid " + gaugeStatusToken(p.status).border, borderRadius: 16, padding: "2px 9px", fontSize: 9, fontWeight: 600, color: gaugeStatusToken(p.status).text, whiteSpace: "nowrap" }}>
                    {gaugeStatusLabel(p.status)}
                  </div>
                </div>
              </div>

              {p.description && (
                <div style={{ fontSize: 11, color: C.textSoft, lineHeight: 1.5, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                  {p.description}
                </div>
              )}

              {/* Blocked reason */}
              {blocked && p.blocked_reason && (
                <div style={{ fontSize: 11, color: C.red, background: C.redFaint, border: "1px solid " + C.redLine, borderRadius: 6, padding: "5px 8px", marginBottom: 6, lineHeight: 1.5 }}>
                  {p.blocked_reason}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {p.priority && (
                  <span style={{ fontSize: 10, color: PRIORITY_COLORS[p.priority], display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_COLORS[p.priority], display: "inline-block" }} />
                    {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                  </span>
                )}
                {p.start_date && (
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO }}>
                    Started {fmt(p.start_date)}
                  </span>
                )}
                {p.due_date && (
                  <span style={{ fontSize: 10, color: C.textMuted }}>Due · {fmt(p.due_date)}</span>
                )}
                {p.assignee && (
                  <span style={{ fontSize: 10, color: C.textMuted }}>{"Owner: " + p.assignee}</span>
                )}
                {extCount > 0 && (
                  <span style={{ fontSize: 10, color: C.yellow, fontFamily: MONO }}>↗ {extCount} external</span>
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
