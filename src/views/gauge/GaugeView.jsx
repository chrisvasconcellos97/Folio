import { useState, useMemo, useDeferredValue } from "react";
import { C } from "../../lib/colors";
import { usePipCorrections } from "../../hooks/usePipCorrections";
import { useContactAliases } from "../../hooks/useContactAliases";
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
import { PipGaugeCard } from "../../components/PipGaugeCard";
import { Glow } from "../../components/Glow";
import { Mark } from "../../components/Mark";
import { pickV } from "../../lib/metricsUtils";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useTasks, updateTask } from "../../hooks/useTasks";
import { FlatTaskQueue } from "./FlatTaskQueue";
import { LeaderProjectsView } from "./LeaderProjectsView";
import { TeammateDetailView } from "./TeammateDetailView";

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

export function GaugeView({ userId, userEmail, accounts, members, contacts, orgId, lens }) {
  var { projects, loading, error: projectsError, refetch: refetchProjects, addProject, updateProject, deleteProject, templates, addTemplate, updateTemplate, deleteTemplate } = useProjects(userId, null, orgId);
  // Phase 3 — flat task queue. Defaults to Tasks tab for Admin lens, Projects for everyone else.
  var { tasks: flatTasks, refetch: refetchTasks } = useTasks(userId);
  function handleToggleDone(task) {
    updateTask(userId, task.id, { done: !task.done })
      .then(function () { refetchTasks(); })
      .catch(function () {});
  }
  // Phase 6 — V2 brain correction log for task edits that go through Gauge.
  var { logCorrection } = usePipCorrections(userId, null);
  var { aliases } = useContactAliases(orgId || null);
  var [primaryView, setPrimaryView] = useState(
    (members || []).length >= 2 && lens === "leader" ? "leader" :
    lens === "admin"  ? "tasks"  :
                        "projects"
  );
  // Phase 5 — drill-in to a teammate from the Leader view. When set, the
  // primary view is suppressed in favor of a read-only TeammateDetailView.
  var [viewingMember, setViewingMember] = useState(null);
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;

  var [searchQuery, setSearchQuery]   = useState("");
  var deferredSearch = useDeferredValue(searchQuery);
  var [scopeFilter, setScopeFilter]   = useState("all");
  var [statusFilter, setStatusFilter] = useState("all");
  var [overdueOnly, setOverdueOnly]   = useState(false);
  var [selectedAccountIds, setSelectedAccountIds] = useState([]);
  var [sortBy, setSortBy]             = useState("default"); // "default" | "due_asc" | "due_desc"
  var [showAdd, setShowAdd]         = useState(false);
  var [showPicker, setShowPicker]   = useState(false);
  var [editing, setEditing]         = useState(null);
  var [expandedRows, setExpandedRows] = useState({});
  var [prefillTemplate, setPrefill] = useState(null);

  var filtered = (function () {
    var bySearch = deferredSearch.trim()
      ? projects.filter(function (p) {
          var q = deferredSearch.toLowerCase();
          return (
            (p.title       || "").toLowerCase().includes(q) ||
            (p.description || "").toLowerCase().includes(q) ||
            (p.assignee    || "").toLowerCase().includes(q)
          );
        })
      : projects;
    var byScope = bySearch;
    if (scopeFilter === "my_queue") {
      byScope = bySearch.filter(function (p) {
        if (userEmail && p.assignee && p.assignee.toLowerCase() === userEmail.toLowerCase()) return true;
        if (p.scope === "personal" && p.user_id === userId) return true;
        var stages = p.stages || [];
        return stages.some(function (s) {
          return s.assignee_email && userEmail && s.assignee_email.toLowerCase() === userEmail.toLowerCase();
        });
      });
    } else if (scopeFilter === "team") {
      byScope = bySearch.filter(function (p) { return p.scope === "team"; });
    } else if (scopeFilter === "personal") {
      byScope = bySearch.filter(function (p) { return !p.scope || p.scope === "personal"; });
    }
    var byStatus = statusFilter === "all" ? byScope : byScope.filter(function (p) { return p.status === statusFilter; });
    if (overdueOnly) {
      byStatus = byStatus.filter(function (p) { return p.status === "in_progress" && isOverdue(p.due_date); });
    }
    var byAccount = selectedAccountIds.length > 0
      ? byStatus.filter(function (p) {
          if (p.account_ids && p.account_ids.length > 0) {
            return p.account_ids.some(function (id) { return selectedAccountIds.includes(id); });
          }
          return p.account_id && selectedAccountIds.includes(p.account_id);
        })
      : byStatus;
    return byAccount;
  })();

  // Drafts float to top, complete sinks to bottom
  var draftFiltered    = filtered.filter(function (p) { return p.status === "draft"; });
  var activeFiltered   = filtered.filter(function (p) { return p.status !== "complete" && p.status !== "draft"; });
  var completeFiltered = filtered.filter(function (p) { return p.status === "complete"; });

  function applySort(list) {
    if (sortBy === "default") return list;
    return list.slice().sort(function (a, b) {
      var aMs = a.due_date ? new Date(a.due_date + "T00:00:00").getTime() : Infinity;
      var bMs = b.due_date ? new Date(b.due_date + "T00:00:00").getTime() : Infinity;
      return sortBy === "due_asc" ? aMs - bMs : bMs - aMs;
    });
  }

  var sortedFiltered = applySort(draftFiltered).concat(applySort(activeFiltered)).concat(applySort(completeFiltered));

  var totalCount      = projects.length;
  var inProgressCount = projects.filter(function (p) { return p.status === "in_progress"; }).length;
  var blockedCount    = projects.filter(function (p) { return p.status === "blocked"; }).length;
  var onHoldCount     = projects.filter(function (p) { return p.status === "on_hold"; }).length;
  var overdueCount    = projects.filter(function (p) { return p.status === "in_progress" && isOverdue(p.due_date); }).length;
  var completedCount  = projects.filter(function (p) { return p.status === "complete"; }).length;

  var accountsById = useMemo(function () {
    var map = {};
    (accounts || []).forEach(function (a) { map[a.id] = a; });
    return map;
  }, [accounts]);

  // Phase 6 — "Projects I own" rollup for AM lens.
  // Filters to projects on accounts where the current user is the owner.
  var ownedAccountIds = useMemo(function () {
    var ids = new Set();
    (accounts || []).forEach(function (a) {
      if (a.owner_user_id && a.owner_user_id === userId) ids.add(a.id);
    });
    return ids;
  }, [accounts, userId]);

  var ownedAccountProjects = useMemo(function () {
    if (lens !== "am" || ownedAccountIds.size === 0) return [];
    return (projects || []).filter(function (p) {
      if (p.status === "complete" || p.status === "draft") return false;
      if (p.account_id && ownedAccountIds.has(p.account_id)) return true;
      if (Array.isArray(p.account_ids)) {
        return p.account_ids.some(function (id) { return ownedAccountIds.has(id); });
      }
      return false;
    });
  }, [projects, ownedAccountIds, lens]);
  var accountsInProjects = useMemo(function () {
    var seen = {};
    projects.forEach(function (p) {
      if (p.account_ids && p.account_ids.length > 0) {
        p.account_ids.forEach(function (id) {
          if (id && !seen[id]) {
            var a = accountsById[id];
            if (a) seen[id] = a.name;
          }
        });
      } else if (p.account_id && !seen[p.account_id]) {
        var a = accountsById[p.account_id];
        if (a) seen[p.account_id] = a.name;
      }
    });
    return Object.entries(seen).map(function (entry) { return { id: entry[0], name: entry[1] }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }, [projects, accountsById]);

  var gaugeHandlers = {
    onClickOverdue: function () { setStatusFilter("all"); setScopeFilter("all"); setOverdueOnly(true); },
    onClickBlocked: function () { setOverdueOnly(false); setStatusFilter("blocked"); },
    onClickProject: function (id) {
      setPrimaryView("projects");
      setOverdueOnly(false); setStatusFilter("all");
      setExpandedRows(function (prev) { return Object.assign({}, prev, { [id]: true }); });
      setTimeout(function () {
        var el = document.querySelector('[data-project-id="' + id + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    },
  };
  var gaugeInsight = buildGaugeInsight(projects, accountsById, gaugeHandlers);

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
    // If this project was created from a template with a known duration,
    // set expected_complete_date = today + duration days.
    var withExpected = Object.assign({}, data);
    if (!withExpected.expected_complete_date && prefillTemplate && prefillTemplate.total_duration_days) {
      withExpected.expected_complete_date = new Date(
        Date.now() + prefillTemplate.total_duration_days * 86400000
      ).toISOString().slice(0, 10);
    }
    return addProject(withExpected);
  }

  function handleSaveEdit(data) {
    return updateProject(editing.id, data);
  }

  function handleUseTemplate(tpl) {
    setShowPicker(false);
    // Phase 4 — hydrate due_date from due_offset_days so each stage lands with
    // a real date computed off today. Assignees ride along untouched.
    var today = new Date(); today.setHours(0,0,0,0);
    function dateFromOffset(off) {
      if (typeof off !== "number" || off < 0) return null;
      var d = new Date(today.getTime() + off * 86400000);
      return d.toISOString().slice(0, 10);
    }
    var hydratedStages = (tpl.stages || []).map(function (s) {
      var out = Object.assign({}, s);
      if (typeof s.due_offset_days === "number") out.due_date = dateFromOffset(s.due_offset_days);
      out.sub_stages = (s.sub_stages || []).map(function (sub) {
        var subOut = Object.assign({}, sub);
        if (typeof sub.due_offset_days === "number") subOut.due_date = dateFromOffset(sub.due_offset_days);
        return subOut;
      });
      return out;
    });
    setPrefill(Object.assign({}, tpl, { stages: hydratedStages }));
    setShowAdd(true);
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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

      {/* Phase 3 + 5 — primary view toggle. Leader option only shows for
          users whose default_lens is "leader". Drill-in to a teammate
          hides the toggle while the detail view is up. */}
      <div style={{ display: scopeFilter === "my_queue" || viewingMember ? "none" : "flex", gap: 6, marginBottom: 14 }}>
        {[
          (members || []).length >= 2 ? { id: "leader",   label: "Leader"   } : null,
          { id: "projects", label: "Projects" },
          { id: "tasks",    label: "Tasks"    },
        ].filter(Boolean).map(function (v) {
          var active = primaryView === v.id;
          return (
            <button
              key={v.id}
              onClick={function () { setPrimaryView(v.id); }}
              style={{
                background: active ? C.accentFaint : "transparent",
                color: active ? C.accent : C.textMuted,
                border: "1px solid " + (active ? C.accentLine : C.rule),
                borderRadius: 8,
                padding: "7px 16px",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13, fontWeight: active ? 600 : 500,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {viewingMember ? (
        <TeammateDetailView
          userId={userId}
          memberEmail={viewingMember}
          projects={projects}
          accounts={accounts}
          onBack={function () { setViewingMember(null); }}
        />
      ) : primaryView === "leader" ? (
        <LeaderProjectsView
          projects={projects}
          accounts={accounts}
          members={members}
          userEmail={userEmail}
          onOpenProject={function (id) {
            setPrimaryView("projects");
            setOverdueOnly(false); setStatusFilter("all"); setScopeFilter("all");
            setExpandedRows(function (prev) { return Object.assign({}, prev, { [id]: true }); });
            setTimeout(function () {
              var el = document.querySelector('[data-project-id="' + id + '"]');
              if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
          onOpenMember={function (email) { setViewingMember(email); }}
        />
      ) : primaryView === "tasks" ? (
        <div style={{
          display: isDesktop ? "grid" : "block",
          gridTemplateColumns: isDesktop ? "minmax(0, 1fr) 340px" : undefined,
          gap: isDesktop ? 24 : 0,
          alignItems: "flex-start",
        }}>
          <div style={{ maxWidth: isDesktop ? 720 : "100%", minWidth: 0 }}>
            <FlatTaskQueue
              tasks={flatTasks}
              accounts={accounts}
              projects={projects}
              members={members}
              userEmail={userEmail}
              onOpenProject={function (id) {
                setPrimaryView("projects");
                setExpandedRows(function (prev) { return Object.assign({}, prev, { [id]: true }); });
                setTimeout(function () {
                  var el = document.querySelector('[data-project-id="' + id + '"]');
                  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 80);
              }}
              showAssigneeChip={lens !== "admin"}
              onToggleDone={handleToggleDone}
            />
          </div>
          {isDesktop && (flatTasks && flatTasks.length > 0) && (
            <div style={{
              position: "sticky", top: 16, alignSelf: "start",
              display: "flex", flexDirection: "column", gap: 12,
              maxWidth: 340,
            }}>
              <PipGaugeCard
                projects={projects}
                accountsById={accountsById}
                handlers={gaugeHandlers}
              />
            </div>
          )}
        </div>
      ) : (
        <>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)",
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
          { label: "Complete",    value: completedCount,  color: C.statusComplete.text, isZero: completedCount === 0, statusId: "complete" },
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

      {/* Search bar */}
      <div style={{ marginBottom: 10, position: "relative" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={function (e) { setSearchQuery(e.target.value); }}
          placeholder="Search projects…"
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 6, padding: "7px 32px 7px 30px",
            fontFamily: MONO, fontSize: 12, color: C.text,
            outline: "none",
          }}
          onFocus={function (e) { e.target.style.borderColor = C.accent; }}
          onBlur={function  (e) { e.target.style.borderColor = C.rule;   }}
        />
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: C.textMuted, fontSize: 12, pointerEvents: "none",
        }}>⌕</span>
        {searchQuery && (
          <button
            onClick={function () { setSearchQuery(""); }}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: C.textMuted,
              cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 2,
            }}
          >×</button>
        )}
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
        <div style={{ flex: 1 }} />
        <button
          onClick={function () {
            setSortBy(function (prev) {
              return prev === "default" ? "due_asc" : prev === "due_asc" ? "due_desc" : "default";
            });
          }}
          title="Sort by due date"
          style={{
            flex: "0 0 auto",
            padding: "4px 12px",
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: MONO,
            fontSize: 10.5,
            background: sortBy !== "default" ? C.accentFaint : "transparent",
            color: sortBy !== "default" ? C.accent : C.textMuted,
            border: "1px solid " + (sortBy !== "default" ? C.accentLine : C.rule),
            whiteSpace: "nowrap",
          }}
        >
          {sortBy === "due_asc" ? "Due ↑" : sortBy === "due_desc" ? "Due ↓" : "Sort"}
        </button>
      </div>

      {/* Account filter pills — only shown when projects span more than one account */}
      {accountsInProjects.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 5,
            marginBottom: 10,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {selectedAccountIds.length > 0 && (
            <button
              onClick={function () { setSelectedAccountIds([]); }}
              style={{
                flex: "0 0 auto",
                padding: "4px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                background: C.accentFaint,
                color: C.accent,
                border: "1px solid " + C.accentLine,
                whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 6,
                fontWeight: 600,
              }}
            >
              Clear
              <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
            </button>
          )}
          {accountsInProjects.map(function (acct) {
            var isSelected = selectedAccountIds.includes(acct.id);
            return (
              <button
                key={acct.id}
                onClick={function () {
                  setSelectedAccountIds(function (prev) {
                    return isSelected
                      ? prev.filter(function (id) { return id !== acct.id; })
                      : prev.concat([acct.id]);
                  });
                }}
                style={{
                  flex: "0 0 auto",
                  padding: "4px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  background: isSelected ? C.accent : "transparent",
                  color: isSelected ? C.bg : C.textMuted,
                  border: "1px solid " + (isSelected ? C.accent : C.rule),
                  whiteSpace: "nowrap",
                }}
              >
                {acct.name}
              </button>
            );
          })}
        </div>
      )}

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

      {/* Phase 6 — AM "Projects I own" rollup. Shepherd view: compact progress
          bars for all active projects on accounts this user owns. Clicking
          scrolls to + expands the project row in the list below. */}
      {lens === "am" && ownedAccountProjects.length > 0 && scopeFilter !== "my_queue" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
          }}>
            My Accounts · Projects
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ownedAccountProjects.map(function (p) {
              var steps = countSteps(p.stages);
              var pct   = steps.total > 0 ? Math.round((steps.done / steps.total) * 100) : 0;
              var acct  = p.account_id ? accountsById[p.account_id] : null;
              var statusKey = p.status.split("_").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
              var statusStyle = C["status" + statusKey] || C.statusPlanned;
              var overdue = p.status === "in_progress" && isOverdue(p.due_date);
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={function () {
                    setScopeFilter("all"); setStatusFilter("all"); setOverdueOnly(false);
                    setExpandedRows(function (prev) { return Object.assign({}, prev, { [p.id]: true }); });
                    setTimeout(function () {
                      var el = document.querySelector('[data-project-id="' + p.id + '"]');
                      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 80);
                  }}
                  onKeyDown={function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setScopeFilter("all"); setStatusFilter("all"); setOverdueOnly(false);
                      setExpandedRows(function (prev) { return Object.assign({}, prev, { [p.id]: true }); });
                      setTimeout(function () {
                        var el = document.querySelector('[data-project-id="' + p.id + '"]');
                        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 80);
                    }
                  }}
                  style={{
                    background: C.surface,
                    border: "1px solid " + C.rule,
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto 90px",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontFamily: SERIF, fontSize: 14, color: overdue ? C.red : C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title}
                  </div>
                  {acct && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                      {acct.name}
                    </div>
                  )}
                  <div style={{
                    background: statusStyle ? statusStyle.bg : "transparent",
                    border: "1px solid " + (statusStyle ? statusStyle.border : C.rule),
                    borderRadius: 999,
                    padding: "1px 7px",
                    fontFamily: MONO, fontSize: 9,
                    color: statusStyle ? statusStyle.text : C.textMuted,
                    whiteSpace: "nowrap",
                  }}>
                    {STATUS_LABELS[p.status] || p.status}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <div style={{ flex: 1, height: 3, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: overdue ? C.red : "linear-gradient(to right, #3b82f6, var(--c-accent))", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, whiteSpace: "nowrap", fontFeatureSettings: '"tnum"' }}>
                      {steps.done}/{steps.total}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
          logCorrection={logCorrection}
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

      {/* Desktop: two-column layout — narrow scannable project list on the
          left, Pip + insights sidebar on the right. Mobile collapses to a
          single column with the Pip card above the list as before. */}
      <div style={{
        display: scopeFilter === "my_queue" ? "block" : (isDesktop ? "grid" : "block"),
        gridTemplateColumns: isDesktop ? "minmax(0, 1fr) 340px" : undefined,
        gap: isDesktop ? 24 : 0,
        alignItems: "flex-start",
      }}>
        <div style={{ maxWidth: isDesktop ? 720 : "100%", minWidth: 0 }}>
          {projects && projects.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <ErrorBanner message={projectsError ? "Couldn't load projects — check your connection" : null} onRetry={refetchProjects} />
              {!isDesktop && <PipInsightCard segments={[gaugeInsight]} />}
            </div>
          )}

          <div style={{ display: scopeFilter === "my_queue" ? "none" : "flex", flexDirection: "column", gap: 6 }}>
            {sortedFiltered.map(function (p) {
          var isComplete  = p.status === "complete";
          var isDraft     = p.status === "draft";
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var dueSoon     = p.due_date && !overdue && p.status !== "complete" && p.status !== "draft" &&
                            (new Date(p.due_date + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) <= 7 * 86400000;
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

          var leftEdge = isComplete ? null : PRIORITY_COLORS[p.priority];
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
                  {/* Due date pill — inline in meta row on mobile, hidden on desktop (shown in right col) */}
                  {isMobile && p.due_date && (
                    <div style={{
                      fontFamily: MONO, fontSize: 9.5, fontFeatureSettings: '"tnum"',
                      padding: "2px 8px", borderRadius: 999,
                      background: overdue ? "rgba(239,68,68,0.15)" : dueSoon ? "rgba(234,179,8,0.12)" : C.surface3,
                      border: "1px solid " + (overdue ? C.red : dueSoon ? C.yellow : C.rule),
                      color: overdue ? C.red : dueSoon ? C.yellow : C.textMuted,
                      whiteSpace: "nowrap",
                    }}>
                      {overdue ? "Overdue" : "Due"} · {fmt(p.due_date)}
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

              {/* Right: stages + progress bar + due date pill (desktop only) */}
              {!isMobile && (
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 80 }}>
                  {steps.total > 0 && (
                    <>
                      <div style={{
                        fontFamily: MONO, fontSize: 13.5, fontWeight: 700,
                        color: isComplete ? C.textMuted : C.accent, lineHeight: 1.1,
                        textShadow: isComplete ? "none" : "0 0 12px " + C.accentGlow + ", 0 0 24px " + C.accentGlow2,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        <span style={{ color: C.text }}>{steps.done}<span style={{ color: C.textMuted }}>/{steps.total}</span></span>
                        <span style={{ color: C.textMuted, margin: "0 6px" }}>·</span>
                        {pct}%
                      </div>
                      <div style={{ position: "relative", height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden", width: "100%" }}>
                        <div style={{
                          position: "absolute", inset: 0,
                          background: isComplete ? C.textMuted : "linear-gradient(to right, #3b82f6, var(--c-accent))",
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
                  {p.due_date && (
                    <div style={{
                      fontFamily: MONO, fontSize: 9.5, fontFeatureSettings: '"tnum"',
                      padding: "3px 10px", borderRadius: 999,
                      background: overdue ? "rgba(239,68,68,0.15)" : dueSoon ? "rgba(234,179,8,0.12)" : C.surface3,
                      border: "1px solid " + (overdue ? C.red : dueSoon ? C.yellow : C.rule),
                      color: overdue ? C.red : dueSoon ? C.yellow : C.textMuted,
                      whiteSpace: "nowrap",
                      fontWeight: overdue || dueSoon ? 600 : 400,
                    }}>
                      {overdue ? "Overdue" : "Due"} · {fmt(p.due_date)}
                    </div>
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
                    color: isComplete ? C.textMuted : C.accent,
                    textShadow: isComplete ? "none" : "0 0 12px " + C.accentGlow + ", 0 0 24px " + C.accentGlow2,
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
                    background: isComplete ? C.textMuted : "linear-gradient(to right, #3b82f6, var(--c-accent))",
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
                  {p.expected_complete_date && (function () {
                    var expMs  = new Date(p.expected_complete_date + "T00:00:00").getTime();
                    var nowMs  = new Date(new Date().toDateString()).getTime();
                    var isPast = expMs < nowMs;
                    return (<>
                      <div style={{ color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9.5 }}>Est. Complete</div>
                      <div style={{ color: isPast ? C.yellow : C.text, fontFeatureSettings: '"tnum"' }}>
                        {fmt(p.expected_complete_date)}{isPast ? " · overdue" : ""}
                      </div>
                    </>);
                  })()}
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
                    contacts={contacts}
                    aliases={aliases}
                    userEmail={userEmail}
                    onUpdate={updateProject}
                    logCorrection={logCorrection}
                  />
                ) : (
                  <ProjectStageEditor
                    project={p}
                    onUpdate={updateProject}
                    accounts={accounts}
                    members={members}
                    contacts={contacts}
                    aliases={aliases}
                    userEmail={userEmail}
                    logCorrection={logCorrection}
                  />
                )}
              </div>
            )}
            </div>
          );
        })}
          </div>
        </div>

        {/* Desktop right sidebar — Gauge-specific Pip card */}
        {isDesktop && scopeFilter !== "my_queue" && projects && projects.length > 0 && (
          <div style={{
            position: "sticky", top: 16, alignSelf: "start",
            display: "flex", flexDirection: "column", gap: 12,
            maxWidth: 340,
          }}>
            <PipGaugeCard
              projects={projects}
              accountsById={accountsById}
              handlers={gaugeHandlers}
            />
          </div>
        )}
      </div>

        </>
      )}

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
