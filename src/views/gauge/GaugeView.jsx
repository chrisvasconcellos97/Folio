import { useState } from "react";
import { C, glass } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { useProjects } from "../../hooks/useProjects";
import { ProjectModal } from "./ProjectModal";
import { PipLoader } from "../../components/PipLoader";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var STATUS_COLORS = {
  planned:     C.statusPlanned.text,
  in_progress: C.accent,
  blocked:     C.statusBlocked.text,
  complete:    C.statusComplete.text,
  on_hold:     C.statusOnHold.text,
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

var FILTERS = [
  { id: "all",         label: "All"         },
  { id: "my_queue",    label: "My Queue"    },
  { id: "planned",     label: "Planned"     },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked",     label: "Blocked"     },
  { id: "complete",    label: "Complete"    },
  { id: "on_hold",     label: "On Hold"     },
];

var GB      = C.blueFaint;
var GB_BDR  = C.blueLine;

function fmt(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + "T00:00:00") < new Date(new Date().toDateString());
}

export function GaugeView({ userId, userEmail, accounts }) {
  var { projects, loading, addProject, updateProject, deleteProject } = useProjects(userId);
  var [filter, setFilter]         = useState("all");
  var [showAdd, setShowAdd]       = useState(false);
  var [editing, setEditing]       = useState(null);

  var filtered = (function () {
    if (filter === "my_queue") {
      return projects.filter(function (p) {
        return userEmail && p.assignee && p.assignee.toLowerCase() === userEmail.toLowerCase();
      });
    }
    if (filter === "all") return projects;
    return projects.filter(function (p) { return p.status === filter; });
  })();

  var totalCount      = projects.length;
  var inProgressCount = projects.filter(function (p) { return p.status === "in_progress"; }).length;
  var completedCount  = projects.filter(function (p) { return p.status === "complete"; }).length;
  var blockedCount    = projects.filter(function (p) { return p.status === "blocked"; }).length;
  var onHoldCount     = projects.filter(function (p) { return p.status === "on_hold"; }).length;

  function getAccountName(id) {
    if (!id) return null;
    var a = (accounts || []).find(function (a) { return a.id === id; });
    return a ? a.name : null;
  }

  function handleSaveNew(data) {
    return addProject(data);
  }

  function handleSaveEdit(data) {
    return updateProject(editing.id, data);
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Gauge
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            Project Management · {inProgressCount} Active
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={function () { setFilter(filter); }}
            style={{
              width: 28, height: 28, borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid " + C.rule,
              color: C.textMuted, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
            </svg>
          </button>
          <button
            onClick={function () { setShowAdd(true); }}
            style={{
              background: C.accentDeep,
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              color: C.bg,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 1,
          marginBottom: 20,
          background: C.rule,
          border: "1px solid " + C.rule,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {[
          { label: "Total",       value: totalCount,      color: C.textSoft,   isZero: totalCount === 0      },
          { label: "In Progress", value: inProgressCount, color: C.accent,     isZero: inProgressCount === 0 },
          { label: "Blocked",     value: blockedCount,    color: C.red,        isZero: blockedCount === 0    },
          { label: "On Hold",     value: onHoldCount,     color: C.yellow,     isZero: onHoldCount === 0     },
          { label: "Complete",    value: completedCount,  color: C.statusComplete.text, isZero: completedCount === 0 },
        ].map(function (s) {
          return (
            <div
              key={s.label}
              style={{
                background: C.surface,
                padding: "14px 14px",
                textAlign: "center",
              }}
            >
              {s.isZero ? (
                <div style={{ fontFamily: MONO, fontSize: 14, color: C.textFaint, fontFeatureSettings: '"tnum"' }}>—</div>
              ) : (
                <div style={{ fontFamily: SERIF, fontSize: 28, color: s.color, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                  {s.value}
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          gap: 5,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {FILTERS.map(function (f) {
          var active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={function () { setFilter(f.id); }}
              style={{
                flex: "0 0 auto",
                padding: "4px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                background: active ? C.accent : "transparent",
                color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule),
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Project list */}
      {loading && <PipLoader />}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          {filter === "all"
            ? "No projects yet. Hit + New Project to get started."
            : filter === "my_queue"
            ? "Nothing assigned to you right now."
            : "No " + (STATUS_LABELS[filter] || filter) + " projects."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(function (p) {
          var acctName    = getAccountName(p.account_id);
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var dimmed      = p.status === "complete";
          var totalStages = p.stages && p.stages.length > 0 ? p.stages.length : 0;
          var doneStages  = totalStages > 0 ? p.stages.filter(function (s) { return !!s.completed_at; }).length : 0;
          var pct         = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;

          var statusStyle = C["status" + p.status.split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("")] || C.statusPlanned;

          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              role="button"
              tabIndex={0}
              onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(p); } }}
              style={{
                background: C.surface,
                border: "1px solid " + (p.status === "blocked" ? C.statusBlocked.border : C.rule),
                borderRadius: 8,
                padding: "14px 16px",
                cursor: "pointer",
                opacity: dimmed ? 0.7 : 1,
                display: "grid",
                gridTemplateColumns: "1fr 200px",
                gap: 16,
                alignItems: "start",
              }}
            >
              {/* Left: title + description + meta */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.3 }}>
                    {p.title}
                  </div>
                  {/* Status pill */}
                  <div style={{
                    background: statusStyle ? statusStyle.bg : "transparent",
                    border: "1px solid " + (statusStyle ? statusStyle.border : C.rule),
                    borderRadius: 999,
                    padding: "2px 9px",
                    fontFamily: MONO, fontSize: 9.5,
                    color: statusStyle ? statusStyle.text : C.textMuted,
                    flexShrink: 0, whiteSpace: "nowrap",
                  }}>
                    {STATUS_LABELS[p.status] || p.status}
                  </div>
                  {acctName && (
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {acctName}
                    </div>
                  )}
                </div>

                {p.description && (
                  <div style={{
                    fontFamily: SERIF, fontSize: 13.5, color: C.textSoft, lineHeight: 1.5,
                    marginBottom: 8,
                    overflow: "hidden", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {p.description}
                  </div>
                )}

                {/* Meta row */}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {p.priority && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: PRIORITY_COLORS[p.priority], display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_COLORS[p.priority], display: "inline-block" }} />
                      {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                    </div>
                  )}
                  {p.assignee && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                      {p.assignee}
                    </div>
                  )}
                  {p.due_date && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: overdue ? C.red : C.textMuted, fontFeatureSettings: '"tnum"' }}>
                      {overdue ? "Overdue · " : "Due · "}{fmt(p.due_date)}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: stages + gradient progress bar */}
              {totalStages > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, marginBottom: 6 }}>
                    {doneStages}/{totalStages} stages · {pct}%
                  </div>
                  {/* Gradient progress track */}
                  <div style={{ position: "relative", height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(to right, oklch(0.42 0.09 232), oklch(0.55 0.12 200), oklch(0.68 0.13 178), oklch(0.80 0.13 162))",
                      borderRadius: 2,
                    }} />
                    {/* Mask covering unfilled portion */}
                    <div style={{
                      position: "absolute", top: 0, right: 0, bottom: 0,
                      width: (100 - pct) + "%",
                      background: C.surface3,
                    }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add modal */}
      {showAdd && (
        <ProjectModal
          accounts={accounts}
          onSave={handleSaveNew}
          onClose={function () { setShowAdd(false); }}
        />
      )}

      {/* Edit modal */}
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
