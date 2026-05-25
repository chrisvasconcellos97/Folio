import { useState } from "react";
import { C, glass } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { useProjects } from "../../hooks/useProjects";
import { ProjectModal } from "./ProjectModal";
import { PipLoader } from "../../components/PipLoader";

var STATUS_COLORS = {
  planned:     "rgba(103,200,249,0.7)",
  in_progress: C.blue,
  blocked:     C.red,
  complete:    C.green,
  on_hold:     C.yellow,
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

var GB      = "rgba(103,200,249,0.12)";
var GB_BDR  = "rgba(103,200,249,0.2)";

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
      {/* Header banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(103,200,249,0.07) 0%, rgba(103,200,249,0.02) 100%)",
          border: "1px solid " + GB_BDR,
          borderRadius: 16,
          padding: "20px 24px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <GaugeIcon size={44} glow />
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: C.text,
                letterSpacing: "0.1em",
                lineHeight: 1.1,
              }}
            >
              GAUGE
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(103,200,249,0.9)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 3,
              }}
            >
              Project Management
            </div>
          </div>
        </div>

        <button
          onClick={function () { setShowAdd(true); }}
          style={{
            background: GB,
            border: "1px solid " + GB_BDR,
            borderRadius: 24,
            padding: "8px 18px",
            color: "rgba(103,200,249,0.9)",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
          }}
        >
          + New Project
        </button>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total",       value: totalCount,      color: C.textSub                   },
          { label: "In Progress", value: inProgressCount, color: "rgba(103,200,249,0.9)"      },
          { label: "Blocked",     value: blockedCount,    color: C.red                        },
          { label: "On Hold",     value: onHoldCount,     color: C.yellow                     },
          { label: "Complete",    value: completedCount,  color: C.green                      },
        ].map(function (s) {
          return (
            <div
              key={s.label}
              style={Object.assign({}, glass, {
                borderRadius: 10,
                padding: "12px 14px",
                textAlign: "center",
              })}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: s.color,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          background: "rgba(0,0,0,0.25)",
          borderRadius: 10,
          padding: 3,
          gap: 2,
          marginBottom: 16,
          overflowX: "auto",
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
                padding: "7px 10px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                background: active ? C.bgCardAlt : "transparent",
                color: active ? "rgba(103,200,249,0.9)" : C.textMuted,
                border: "1px solid " + (active ? GB_BDR : "transparent"),
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(function (p) {
          var acctName    = getAccountName(p.account_id);
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var dimmed      = p.status === "complete";
          var totalStages = p.stages && p.stages.length > 0 ? p.stages.length : 0;
          var doneStages  = totalStages > 0 ? p.stages.filter(function (s) { return !!s.completed_at; }).length : 0;

          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              role="button"
              tabIndex={0}
              onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(p); } }}
              style={Object.assign({}, glass, {
                border: "1px solid " + (p.status === "in_progress" ? GB_BDR : p.status === "blocked" ? "rgba(224,92,92,0.3)" : "rgba(255,255,255,0.06)"),
                borderLeft: p.status === "blocked" ? "3px solid rgba(224,92,92,0.8)" : undefined,
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
                opacity: dimmed ? 0.65 : 1,
                transition: "border-color 0.15s",
              })}
            >
              {/* Top row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div style={{ flex: 1 }}>
                  {acctName && (
                    <div
                      style={{
                        fontSize: 10,
                        color: C.accentDim,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 3,
                      }}
                    >
                      {acctName}
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                    {p.title}
                  </div>
                </div>

                <div
                  style={{
                    background: (STATUS_COLORS[p.status] || C.textMuted) + "20",
                    border: "1px solid " + (STATUS_COLORS[p.status] || C.textMuted) + "40",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: STATUS_COLORS[p.status] || C.textMuted,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABELS[p.status] || p.status}
                </div>
              </div>

              {/* Stage progress bar */}
              {totalStages > 0 && (
                <div style={{ marginTop: 6, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: C.textMuted }}>
                      {doneStages}/{totalStages} stages
                    </span>
                    {doneStages === totalStages && (
                      <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>Done</span>
                    )}
                  </div>
                  <div style={{ height: 3, background: C.bgDark, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 2,
                      width: (totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0) + "%",
                      background: doneStages === totalStages ? C.green : "rgba(103,200,249,0.9)",
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>
              )}

              {/* Description */}
              {p.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: C.textSub,
                    lineHeight: 1.5,
                    marginBottom: 10,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {p.description}
                </div>
              )}

              {/* Bottom row */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {p.priority && (
                  <div
                    style={{
                      fontSize: 10,
                      color: PRIORITY_COLORS[p.priority],
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: PRIORITY_COLORS[p.priority],
                        display: "inline-block",
                      }}
                    />
                    {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                  </div>
                )}

                {p.due_date && (
                  <div
                    style={{
                      fontSize: 10,
                      color: overdue ? C.red : C.textMuted,
                      fontWeight: overdue ? 600 : 400,
                    }}
                  >
                    {overdue ? "Overdue · " : "Due · "}
                    {fmt(p.due_date)}
                  </div>
                )}

                {p.assignee && (
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    {"↳ " + p.assignee}
                  </div>
                )}

                {p.requested_by && (
                  <div style={{ fontSize: 10, color: C.textMuted }}>
                    {"req. " + p.requested_by}
                  </div>
                )}
              </div>
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
