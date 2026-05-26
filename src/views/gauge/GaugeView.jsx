import { useState } from "react";
import { C } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { useProjects } from "../../hooks/useProjects";
import { ProjectModal } from "./ProjectModal";
import { TemplatePickerModal } from "./TemplatePickerModal";
import { PipLoader } from "../../components/PipLoader";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
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
  { id: "team",        label: "Team"        },
  { id: "personal",    label: "Personal"    },
];

function fmt(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + "T00:00:00") < new Date(new Date().toDateString());
}

// Count total steps including sub-stages
function countSteps(stages) {
  if (!stages || stages.length === 0) return { total: 0, done: 0 };
  var total = 0;
  var done  = 0;
  stages.forEach(function (s) {
    total++;
    if (s.completed_at) done++;
    var subs = s.sub_stages || [];
    subs.forEach(function (sub) {
      total++;
      if (sub.completed_at) done++;
    });
  });
  return { total: total, done: done };
}

// Count external (is_external=true) stages that are not completed
function countExternal(stages) {
  if (!stages || stages.length === 0) return 0;
  return stages.filter(function (s) { return s.is_external && !s.completed_at; }).length;
}

export function GaugeView({ userId, userEmail, accounts, members, orgId }) {
  var { projects, loading, addProject, updateProject, deleteProject, templates, addTemplate, updateTemplate, deleteTemplate } = useProjects(userId, null, orgId);
  var [filter, setFilter]           = useState("all");
  var [showAdd, setShowAdd]         = useState(false);
  var [showPicker, setShowPicker]   = useState(false);
  var [editing, setEditing]         = useState(null);
  var [prefillTemplate, setPrefill] = useState(null);

  var filtered = (function () {
    if (filter === "my_queue") {
      return projects.filter(function (p) {
        // Project-level assignee match
        if (userEmail && p.assignee && p.assignee.toLowerCase() === userEmail.toLowerCase()) return true;
        // Personal scope + owner
        if (p.scope === "personal" && p.user_id === userId) return true;
        // Assignee in any stage
        var stages = p.stages || [];
        return stages.some(function (s) {
          return s.assignee_email && userEmail && s.assignee_email.toLowerCase() === userEmail.toLowerCase();
        });
      });
    }
    if (filter === "team")    return projects.filter(function (p) { return p.scope === "team"; });
    if (filter === "personal") return projects.filter(function (p) { return !p.scope || p.scope === "personal"; });
    if (filter === "all")     return projects;
    return projects.filter(function (p) { return p.status === filter; });
  })();

  // Dim complete to bottom
  var activeFiltered   = filtered.filter(function (p) { return p.status !== "complete"; });
  var completeFiltered = filtered.filter(function (p) { return p.status === "complete"; });
  var sortedFiltered   = activeFiltered.concat(completeFiltered);

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

  function getAccountNames(ids) {
    if (!ids || ids.length === 0) return null;
    var names = ids
      .map(function (id) { return getAccountName(id); })
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : null;
  }

  function handleSaveNew(data) {
    return addProject(data);
  }

  function handleSaveEdit(data) {
    return updateProject(editing.id, data);
  }

  function handleUseTemplate(tpl) {
    setShowPicker(false);
    setPrefill(tpl);
    setShowAdd(true);
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
            onClick={function () { setShowPicker(true); }}
            style={{
              background: "transparent",
              border: "1px solid " + C.rule,
              borderRadius: 6,
              padding: "8px 14px",
              color: C.textMuted,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + From Template
          </button>
          <button
            onClick={function () { setPrefill(null); setShowAdd(true); }}
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
          { label: "Total",       value: totalCount,      color: C.textSoft,              isZero: totalCount === 0      },
          { label: "In Progress", value: inProgressCount, color: C.accent,                isZero: inProgressCount === 0 },
          { label: "Blocked",     value: blockedCount,    color: C.red,                   isZero: blockedCount === 0    },
          { label: "On Hold",     value: onHoldCount,     color: C.yellow,                isZero: onHoldCount === 0     },
          { label: "Complete",    value: completedCount,  color: C.statusComplete.text,   isZero: completedCount === 0  },
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

      {!loading && sortedFiltered.length === 0 && (
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
            : filter === "team"
            ? "No team projects yet."
            : filter === "personal"
            ? "No personal projects yet."
            : "No " + (STATUS_LABELS[filter] || filter) + " projects."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sortedFiltered.map(function (p) {
          var isComplete  = p.status === "complete";
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var steps       = countSteps(p.stages);
          var pct         = steps.total > 0 ? Math.round((steps.done / steps.total) * 100) : 0;
          var extCount    = countExternal(p.stages || []);
          var acctDisplay = (p.account_ids && p.account_ids.length > 0)
            ? getAccountNames(p.account_ids)
            : getAccountName(p.account_id);

          var statusKey   = p.status.split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
          var statusStyle = C["status" + statusKey] || C.statusPlanned;

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
                opacity: isComplete ? 0.45 : 1,
                display: "grid",
                gridTemplateColumns: "1fr 200px",
                gap: 16,
                alignItems: "start",
              }}
            >
              {/* Left: title + description + meta */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <div style={{
                    fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.3,
                    textDecoration: isComplete ? "line-through" : "none",
                  }}>
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
                  {/* Team scope badge */}
                  {p.scope === "team" && (
                    <div style={{
                      background: C.accentFaint,
                      border: "1px solid " + C.accentLine,
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontFamily: MONO, fontSize: 9,
                      color: C.accent,
                      flexShrink: 0, whiteSpace: "nowrap",
                      letterSpacing: "0.08em",
                    }}>
                      TEAM
                    </div>
                  )}
                  {/* Account display */}
                  {acctDisplay && (
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {acctDisplay}
                    </div>
                  )}
                </div>

                {p.description && (
                  <div style={{
                    fontFamily: SERIF, fontSize: 13.5, color: C.textSoft, lineHeight: 1.5,
                    marginBottom: 6,
                    overflow: "hidden", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {p.description}
                  </div>
                )}

                {/* Start date */}
                {p.start_date && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginBottom: 4 }}>
                    Started {fmt(p.start_date)}
                  </div>
                )}

                {/* Blocked reason */}
                {p.status === "blocked" && p.blocked_reason && (
                  <div style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 12, color: C.red,
                    background: C.redFaint,
                    border: "1px solid " + C.redLine,
                    borderRadius: 6,
                    padding: "6px 10px",
                    marginBottom: 6,
                    lineHeight: 1.5,
                  }}>
                    {p.blocked_reason}
                  </div>
                )}

                {/* Meta row */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
                  {/* External stages badge */}
                  {extCount > 0 && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.yellow }}>
                      ↗ {extCount} external
                    </div>
                  )}
                </div>
              </div>

              {/* Right: stages + gradient progress bar */}
              {steps.total > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, marginBottom: 6 }}>
                    {steps.done}/{steps.total} steps · {pct}%
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

      {/* Template picker */}
      {showPicker && (
        <TemplatePickerModal
          templates={templates}
          onUse={handleUseTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onClose={function () { setShowPicker(false); }}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <ProjectModal
          accounts={accounts}
          members={members}
          userId={userId}
          onSave={handleSaveNew}
          onClose={function () { setShowAdd(false); setPrefill(null); }}
          addTemplate={addTemplate}
          prefillTemplate={prefillTemplate}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <ProjectModal
          existing={editing}
          accounts={accounts}
          members={members}
          userId={userId}
          onSave={handleSaveEdit}
          onDelete={deleteProject}
          onClose={function () { setEditing(null); }}
          addTemplate={addTemplate}
        />
      )}
    </div>
  );
}
