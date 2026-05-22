import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { useProjects } from "../../hooks/useProjects";
import { ProjectModal } from "./ProjectModal";

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

var FILTERS = [
  { id: "all",       label: "All"       },
  { id: "active",    label: "Active"    },
  { id: "on_hold",   label: "On Hold"   },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

var GB_BDR = "rgba(103,200,249,0.2)";

function fmt(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + "T00:00:00") < new Date(new Date().toDateString());
}

export function ProjectsView({ userId, accounts, openAdd, onAddClosed }) {
  var { projects, loading, addProject, updateProject, deleteProject } = useProjects(userId);
  var [filter, setFilter]   = useState("all");
  var [showAdd, setShowAdd] = useState(false);
  var [editing, setEditing] = useState(null);

  useEffect(function () {
    if (openAdd) setShowAdd(true);
  }, [openAdd]);

  function closeAdd() {
    setShowAdd(false);
    if (onAddClosed) onAddClosed();
  }

  var filtered = filter === "all"
    ? projects
    : projects.filter(function (p) { return p.status === filter; });

  var totalCount     = projects.length;
  var activeCount    = projects.filter(function (p) { return p.status === "active"; }).length;
  var onHoldCount    = projects.filter(function (p) { return p.status === "on_hold"; }).length;
  var completedCount = projects.filter(function (p) { return p.status === "completed"; }).length;

  function getAccountName(id) {
    if (!id) return null;
    var a = (accounts || []).find(function (a) { return a.id === id; });
    return a ? a.name : null;
  }

  return (
    <div>
      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total",     value: totalCount,     color: C.textSub },
          { label: "Active",    value: activeCount,    color: C.blue    },
          { label: "On Hold",   value: onHoldCount,    color: C.yellow  },
          { label: "Completed", value: completedCount, color: C.green   },
        ].map(function (s) {
          return (
            <div
              key={s.label}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 10,
                padding: "14px 12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: s.color,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
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
                  marginTop: 4,
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
          background: "rgba(0,0,0,0.3)",
          borderRadius: 10,
          padding: 3,
          gap: 2,
          marginBottom: 18,
        }}
      >
        {FILTERS.map(function (f) {
          var active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={function () { setFilter(f.id); }}
              style={{
                flex: 1,
                padding: "7px 4px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                background: active ? C.bgCardAlt : "transparent",
                color: active ? C.blue : C.textMuted,
                border: "1px solid " + (active ? GB_BDR : "transparent"),
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          Loading projects…
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          {filter === "all"
            ? "No projects yet. Hit + New Project to get started."
            : "No " + STATUS_LABELS[filter] + " projects."}
        </div>
      )}

      {/* Project cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(function (p) {
          var acctName = getAccountName(p.account_id);
          var overdue  = p.status === "active" && isOverdue(p.due_date);
          var dimmed   = p.status === "completed" || p.status === "cancelled";

          return (
            <div
              key={p.id}
              onClick={function () { setEditing(p); }}
              style={{
                background: C.bgCard,
                border: "1px solid " + (p.status === "active" ? GB_BDR : C.border),
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
                opacity: dimmed ? 0.6 : 1,
                transition: "border-color 0.15s, opacity 0.15s",
              }}
            >
              {/* Top row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.text,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.title}
                  </div>
                </div>

                <div
                  style={{
                    background: STATUS_COLORS[p.status] + "1A",
                    border: "1px solid " + STATUS_COLORS[p.status] + "40",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: STATUS_COLORS[p.status],
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABELS[p.status]}
                </div>
              </div>

              {/* Description */}
              {p.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: C.textSub,
                    lineHeight: 1.55,
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
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {p.priority && (
                  <div
                    style={{
                      fontSize: 10,
                      color: PRIORITY_COLORS[p.priority],
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: PRIORITY_COLORS[p.priority],
                        display: "inline-block",
                        flexShrink: 0,
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Add modal */}
      {showAdd && (
        <ProjectModal
          accounts={accounts}
          onSave={addProject}
          onClose={closeAdd}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <ProjectModal
          existing={editing}
          accounts={accounts}
          onSave={function (data) { return updateProject(editing.id, data); }}
          onDelete={deleteProject}
          onClose={function () { setEditing(null); }}
        />
      )}
    </div>
  );
}
