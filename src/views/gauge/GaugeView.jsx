import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { useProjects } from "../../hooks/useProjects";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ProjectModal } from "./ProjectModal";
import { ProjectStageEditor } from "./ProjectStageEditor";
import { StandingBoardView } from "./StandingBoardView";
import { ProjectNotesEditor } from "./ProjectNotesEditor";
import { MyQueueView } from "./MyQueueView";
import { TemplatePickerModal } from "./TemplatePickerModal";
import { PipLoader } from "../../components/PipLoader";
import { PipInsightCard } from "../../components/PipInsightCard";
import { Glow } from "../../components/Glow";
import { Mark } from "../../components/Mark";
import { pickV } from "../../lib/metricsUtils";
import { useBreakpoint } from "../../hooks/useBreakpoint";

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
  draft:       "Draft",
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


// Scope filter (the row of pills below the status boxes)
var SCOPE_FILTERS = [
  { id: "all",      label: "All"      },
  { id: "my_queue", label: "My Queue" },
  { id: "team",     label: "Team"     },
  { id: "personal", label: "Personal" },
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

function buildGaugeInsight(projects, accountsById, handlers) {
  var prjs = projects || [];
  var active   = prjs.filter(function (p) { return p.status === "in_progress"; });
  var blocked  = prjs.filter(function (p) { return p.status === "blocked"; });
  var onHold   = prjs.filter(function (p) { return p.status === "on_hold"; });
  var overdue  = active.filter(function (p) { return isOverdue(p.due_date); });
  var highPri  = active.filter(function (p) { return p.priority === "high"; });

  var seed = String(new Date().getDate()) + ":" + prjs.length;
  var h    = handlers || {};

  // Hot phrases — only the count/state glows. Named project stays plain text.
  var overdueGlow = (
    <Glow onClick={h.onClickOverdue}>
      {overdue.length + " project" + (overdue.length !== 1 ? "s" : "") + (overdue.length === 1 ? " is" : " are") + " past due"}
    </Glow>
  );
  var blockedGlow = (
    <Glow onClick={h.onClickBlocked}>
      {blocked.length + " project" + (blocked.length !== 1 ? "s" : "") + " blocked"}
    </Glow>
  );
  function projectLabel(p) {
    var acct = p.account_id ? accountsById[p.account_id] : null;
    return p.title + (acct ? " (" + acct.name + ")" : "");
  }

  if (overdue.length > 0) {
    return pickV(seed + "a", [
      <>{overdueGlow}. {projectLabel(overdue[0])} needs eyes first.</>,
      <>Past due: {overdueGlow}. Top of the pile is {projectLabel(overdue[0])}.</>,
    ]);
  }
  if (blocked.length > 0) {
    return pickV(seed + "a", [
      <>{blockedGlow}. {projectLabel(blocked[0])} is waiting on something — unstick it.</>,
      <>Blocked work: {blockedGlow}. Start with {projectLabel(blocked[0])}.</>,
    ]);
  }
  if (highPri.length > 0) {
    return pickV(seed + "a", [
      <>{highPri.length} high-priority project{highPri.length !== 1 ? "s" : ""} in flight. Keep momentum on {projectLabel(highPri[0])}.</>,
      <>Top of mind: {highPri.length} high-priority. Stay on {projectLabel(highPri[0])}.</>,
    ]);
  }
  if (active.length > 0) {
    return pickV(seed + "a", [
      <>{active.length} project{active.length !== 1 ? "s" : ""} in flight. No blockers, no overdues — clean board.</>,
      <>{active.length} active project{active.length !== 1 ? "s" : ""}. Things are moving.</>,
    ]);
  }
  if (onHold.length > 0) {
    return <>{onHold.length} on hold — worth revisiting if context has changed.</>;
  }
  return pickV(seed + "a", [
    "No active projects right now. Nothing on fire.",
    "Gauge is quiet. Take a breath.",
  ]);
}

export function GaugeView({ userId, userEmail, accounts, members, orgId }) {
  var { projects, loading, error: projectsError, refetch: refetchProjects, addProject, updateProject, deleteProject, templates, addTemplate, updateTemplate, deleteTemplate } = useProjects(userId, null, orgId);
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;

  var [scopeFilter, setScopeFilter]   = useState("all");
  var [statusFilter, setStatusFilter] = useState("all");
  var [overdueOnly, setOverdueOnly]   = useState(false);
  var [showAdd, setShowAdd]         = useState(false);
  var [showPicker, setShowPicker]   = useState(false);
  var [editing, setEditing]         = useState(null);
  var [expandedRows, setExpandedRows] = useState({});
  var [prefillTemplate, setPrefill] = useState(null);

  var filtered = (function () {
    var byScope = projects;
    if (scopeFilter === "my_queue") {
      byScope = projects.filter(function (p) {
        if (userEmail && p.assignee && p.assignee.toLowerCase() === userEmail.toLowerCase()) return true;
        if (p.scope === "personal" && p.user_id === userId) return true;
        var stages = p.stages || [];
        return stages.some(function (s) {
          return s.assignee_email && userEmail && s.assignee_email.toLowerCase() === userEmail.toLowerCase();
        });
      });
    } else if (scopeFilter === "team") {
      byScope = projects.filter(function (p) { return p.scope === "team"; });
    } else if (scopeFilter === "personal") {
      byScope = projects.filter(function (p) { return !p.scope || p.scope === "personal"; });
    }
    var byStatus = statusFilter === "all" ? byScope : byScope.filter(function (p) { return p.status === statusFilter; });
    if (overdueOnly) {
      byStatus = byStatus.filter(function (p) { return p.status === "in_progress" && isOverdue(p.due_date); });
    }
    return byStatus;
  })();

  // Drafts float to top, complete sinks to bottom
  var draftFiltered    = filtered.filter(function (p) { return p.status === "draft"; });
  var activeFiltered   = filtered.filter(function (p) { return p.status !== "complete" && p.status !== "draft"; });
  var completeFiltered = filtered.filter(function (p) { return p.status === "complete"; });
  var sortedFiltered   = draftFiltered.concat(activeFiltered).concat(completeFiltered);

  var totalCount      = projects.length;
  var inProgressCount = projects.filter(function (p) { return p.status === "in_progress"; }).length;
  var blockedCount    = projects.filter(function (p) { return p.status === "blocked"; }).length;
  var onHoldCount     = projects.filter(function (p) { return p.status === "on_hold"; }).length;
  var overdueCount    = projects.filter(function (p) { return p.status === "in_progress" && isOverdue(p.due_date); }).length;

  var accountsById = useMemo(function () {
    var map = {};
    (accounts || []).forEach(function (a) { map[a.id] = a; });
    return map;
  }, [accounts]);
  var gaugeInsight = buildGaugeInsight(projects, accountsById, {
    onClickOverdue: function () { setStatusFilter("all"); setScopeFilter("all"); setOverdueOnly(true); },
    onClickBlocked: function () { setOverdueOnly(false); setStatusFilter("blocked"); },
    onClickProject: function (id) {
      setOverdueOnly(false); setStatusFilter("all");
      setExpandedRows(function (prev) { return Object.assign({}, prev, { [id]: true }); });
      setTimeout(function () {
        var el = document.querySelector('[data-project-id="' + id + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    },
  });

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
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "flex-start",
          gap: isMobile ? 12 : 0,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
          <Mark tab="gauge" size={isMobile ? 32 : 52} />
          <div>
            <div style={{ fontFamily: SERIF, fontSize: isMobile ? 26 : 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Gauge
            </div>
            <div style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
              Project Management · {inProgressCount} Active
            </div>
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
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
          gap: 1,
          marginBottom: 20,
          background: C.rule,
          border: "1px solid " + C.rule,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {[
          { label: "Total",       value: totalCount,      color: C.textSoft, isZero: totalCount === 0,      statusId: "all"         },
          { label: "In Progress", value: inProgressCount, color: C.accent,   isZero: inProgressCount === 0, statusId: "in_progress" },
          { label: "Blocked",     value: blockedCount,    color: C.red,      isZero: blockedCount === 0,    statusId: "blocked"     },
          { label: "On Hold",     value: onHoldCount,     color: C.yellow,   isZero: onHoldCount === 0,     statusId: "on_hold"     },
          { label: "Past Due",    value: overdueCount,    color: C.red,      isZero: overdueCount === 0,    statusId: "overdue"     },
        ].map(function (s) {
          var active = s.statusId === "overdue"
            ? overdueOnly
            : (!overdueOnly && statusFilter === s.statusId);
          return (
            <div
              key={s.label}
              onClick={function () {
                if (s.statusId === "overdue") { setOverdueOnly(true); setStatusFilter("all"); }
                else { setOverdueOnly(false); setStatusFilter(s.statusId); }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={function (e) {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (s.statusId === "overdue") { setOverdueOnly(true); setStatusFilter("all"); }
                  else { setOverdueOnly(false); setStatusFilter(s.statusId); }
                }
              }}
              style={{
                background: active ? C.accentFaint : C.surface,
                borderTop:    active ? "2px solid " + s.color : "2px solid transparent",
                padding: "12px 14px",
                textAlign: "center",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
            >
              {s.isZero ? (
                <div style={{ fontFamily: MONO, fontSize: 14, color: C.textFaint, fontFeatureSettings: '"tnum"' }}>—</div>
              ) : (
                <div style={{ fontFamily: SERIF, fontSize: 28, color: s.color, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
                  {s.value}
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: active ? s.color : C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
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
        {SCOPE_FILTERS.map(function (f) {
          var active = scopeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={function () { setScopeFilter(f.id); }}
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

      {overdueOnly && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={function () { setOverdueOnly(false); }}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 999, padding: "4px 12px",
              fontFamily: MONO, fontSize: 10.5, color: C.accent, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            Showing past due
            <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
          </button>
        </div>
      )}

      {/* My Queue — task-level rollup, replaces the project list while active */}
      {!loading && scopeFilter === "my_queue" && (
        <MyQueueView
          projects={projects}
          accounts={accounts}
          members={members}
          userEmail={userEmail}
          onUpdate={updateProject}
          onOpenProject={function (id) {
            setScopeFilter("all");
            setStatusFilter("all");
            setOverdueOnly(false);
            setExpandedRows(function (prev) { return Object.assign({}, prev, { [id]: true }); });
            setTimeout(function () {
              var el = document.querySelector('[data-project-id="' + id + '"]');
              if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
        />
      )}

      {/* Project list */}
      {loading && <PipLoader />}

      {!loading && scopeFilter !== "my_queue" && sortedFiltered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          {scopeFilter === "all" && statusFilter === "all"
            ? "No projects yet. Hit + New Project to get started."
            : scopeFilter === "my_queue"
            ? "Nothing assigned to you right now."
            : scopeFilter === "team"
            ? "No team projects yet."
            : scopeFilter === "personal"
            ? "No personal projects yet."
            : "No " + (STATUS_LABELS[statusFilter] || statusFilter) + " projects."}
        </div>
      )}

      {projects && projects.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <ErrorBanner message={projectsError ? "Couldn't load projects — check your connection" : null} onRetry={refetchProjects} />
          <PipInsightCard segments={[gaugeInsight]} />
        </div>
      )}

      <div style={{ display: scopeFilter === "my_queue" ? "none" : "flex", flexDirection: "column", gap: 6 }}>
        {sortedFiltered.map(function (p) {
          var isComplete  = p.status === "complete";
          var isDraft     = p.status === "draft";
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var steps       = countSteps(p.stages);
          var pct         = steps.total > 0 ? Math.round((steps.done / steps.total) * 100) : 0;
          var extCount    = countExternal(p.stages || []);
          var acctDisplay = (p.account_ids && p.account_ids.length > 0)
            ? getAccountNames(p.account_ids)
            : getAccountName(p.account_id);

          var statusKey   = p.status.split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
          var statusStyle = C["status" + statusKey] || C.statusPlanned;

          var isOpen = !!expandedRows[p.id];
          function toggleRow() { setExpandedRows(function (prev) { return Object.assign({}, prev, { [p.id]: !prev[p.id] }); }); }

          var leftEdge = PRIORITY_COLORS[p.priority];
          var glow     = leftEdge ? "-2px 0 8px -3px " + leftEdge : undefined;

          return (
            <div
              key={p.id}
              data-project-id={p.id}
              className="hover-lift"
              style={{
                background: C.surface,
                border: "1px solid " + (p.status === "blocked" ? C.statusBlocked.border : isDraft ? C.statusDraft.border : C.rule),
                borderLeft: leftEdge ? "3px solid " + leftEdge : "1px solid " + (isDraft ? C.statusDraft.border : C.rule),
                borderRadius: 8,
                boxShadow: glow,
                opacity: isComplete ? 0.45 : isDraft ? 0.65 : 1,
              }}
            >
            <div
              onClick={toggleRow}
              role="button"
              tabIndex={0}
              onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(); } }}
              style={{
                padding: isMobile ? "12px 14px" : "14px 16px",
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: isMobile ? "auto 1fr auto" : "auto 1fr 200px auto",
                gap: isMobile ? 10 : 12,
                alignItems: "start",
              }}
            >
              {/* Chevron */}
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, paddingTop: 3, userSelect: "none" }}>
                {isOpen ? "▾" : "▸"}
              </div>
              {/* Left: title + description + meta */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  {overdue && (
                    <span
                      title="Past due"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: "50%",
                        background: "rgba(232,88,88,0.18)", border: "1px solid " + C.red,
                        color: C.red, fontFamily: MONO, fontWeight: 700, fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      !
                    </span>
                  )}
                  <div style={{
                    fontFamily: SERIF, fontSize: 17, lineHeight: 1.3,
                    color: overdue ? C.red : C.text,
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

              {/* Right: stages + progress bar (desktop only) */}
              {!isMobile && (
                <div style={{ textAlign: "right" }}>
                  {steps.total > 0 && (
                    <>
                      <div style={{
                        fontFamily: MONO, fontSize: 13.5, fontWeight: 700,
                        color: C.accent, marginBottom: 8, lineHeight: 1.1,
                        textShadow: "0 0 12px " + C.accentGlow + ", 0 0 24px " + C.accentGlow2,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        <span style={{ color: C.text }}>{steps.done}<span style={{ color: C.textMuted }}>/{steps.total}</span></span>
                        <span style={{ color: C.textMuted, margin: "0 6px" }}>·</span>
                        {pct}%
                      </div>
                      <div style={{ position: "relative", height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          position: "absolute", inset: 0,
                          background: C.accent,
                          borderRadius: 2,
                        }} />
                        <div style={{
                          position: "absolute", top: 0, right: 0, bottom: 0,
                          width: (100 - pct) + "%",
                          background: C.surface3,
                        }} />
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Edit affordance — pencil on mobile, button on desktop */}
              <button
                onClick={function (e) { e.stopPropagation(); setEditing(p); }}
                title="Edit project"
                aria-label="Edit project"
                style={{
                  background: "transparent", border: "1px solid " + C.rule,
                  borderRadius: 6, color: C.textMuted,
                  fontFamily: MONO,
                  fontSize: isMobile ? 13 : 10,
                  letterSpacing: "0.05em",
                  padding: isMobile ? "4px 8px" : "6px 10px",
                  cursor: "pointer",
                  whiteSpace: "nowrap", alignSelf: "start",
                  lineHeight: 1,
                }}
              >
                {isMobile ? "✎" : "Edit →"}
              </button>
            </div>

            {/* Mobile-only full-width progress strip below the row */}
            {isMobile && steps.total > 0 && (
              <div style={{ padding: "0 14px 12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 13, fontWeight: 700,
                    color: C.accent,
                    textShadow: "0 0 12px " + C.accentGlow + ", 0 0 24px " + C.accentGlow2,
                    fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
                  }}>
                    <span style={{ color: C.text }}>{steps.done}<span style={{ color: C.textMuted }}>/{steps.total}</span></span>
                    <span style={{ color: C.textMuted, margin: "0 6px" }}>·</span>
                    {pct}%
                  </div>
                </div>
                <div style={{ position: "relative", height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: C.accent,
                    borderRadius: 2,
                  }} />
                  <div style={{
                    position: "absolute", top: 0, right: 0, bottom: 0,
                    width: (100 - pct) + "%",
                    background: C.surface3,
                  }} />
                </div>
              </div>
            )}

            {/* Expanded body */}
            {isOpen && (
              <div style={{ padding: "0 16px 14px 16px", borderTop: "1px solid " + C.rule }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  columnGap: 16, rowGap: 6,
                  marginTop: 12, marginBottom: 14,
                  fontFamily: MONO, fontSize: 11,
                }}>
                  {p.requested_by && (<>
                    <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Requested by</div>
                    <div style={{ color: C.text }}>{p.requested_by}</div>
                  </>)}
                  {p.assignee && (<>
                    <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Assigned</div>
                    <div style={{ color: C.text }}>{p.assignee}</div>
                  </>)}
                  {p.start_date && (<>
                    <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Started</div>
                    <div style={{ color: C.text, fontFeatureSettings: '"tnum"' }}>{fmt(p.start_date)}</div>
                  </>)}
                  {p.due_date && (<>
                    <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Due</div>
                    <div style={{ color: overdue ? C.red : C.text, fontFeatureSettings: '"tnum"' }}>{fmt(p.due_date)}</div>
                  </>)}
                  {p.description && (<>
                    <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Scope</div>
                    <div style={{ color: C.textSoft, fontFamily: SERIF, fontSize: 13, lineHeight: 1.5 }}>{p.description}</div>
                  </>)}
                </div>

                <ProjectNotesEditor project={p} onUpdate={updateProject} />
                <div style={{
                  fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 8,
                }}>
                  Tasks
                </div>
                {p.is_standing ? (
                  <StandingBoardView
                    project={p}
                    accounts={accounts}
                    members={members}
                    userEmail={userEmail}
                    onUpdate={updateProject}
                  />
                ) : (
                  <ProjectStageEditor
                    project={p}
                    onUpdate={updateProject}
                    accounts={accounts}
                    members={members}
                    userEmail={userEmail}
                  />
                )}
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
