// Gauge V3 Phase 5 — Leader view.
//
// Org-wide project rollup. Lands as the default primary view for users
// whose default_lens is "leader". Shows every project across every AM
// and account, with filters and a stuck-time signal so leaders can
// spot work that's lost momentum.
//
// Row anatomy: priority dot · title · status pill · account chip ·
// AM chip (clickable → drill into teammate) · progress (X/Y, %) ·
// last-step-completed age (days since the most recent stage close).
//
// Click a row to expand and see every stage inline with assignee +
// due date + completion mark. Click an AM chip to drill into a
// read-only teammate view (their queue + projects they're on).

import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { InfoTip } from "../../components/InfoTip";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

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

var SORTS = [
  { id: "due",      label: "By due date" },
  { id: "progress", label: "By progress" },
  { id: "stuck",    label: "By stuck time" },
];

function fmt(d) {
  if (!d) return null;
  var dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d + "T00:00:00") < new Date(new Date().toDateString());
}

function daysSince(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (!t) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function countSteps(stages) {
  if (!stages || stages.length === 0) return { total: 0, done: 0 };
  var total = 0, done = 0;
  stages.forEach(function (s) {
    total++;
    if (s.completed_at) done++;
    (s.sub_stages || []).forEach(function (sub) {
      total++;
      if (sub.completed_at) done++;
    });
  });
  return { total: total, done: done };
}

function lastStepCompletedAt(stages) {
  var latest = null;
  (stages || []).forEach(function (s) {
    if (s.completed_at && (!latest || s.completed_at > latest)) latest = s.completed_at;
    (s.sub_stages || []).forEach(function (sub) {
      if (sub.completed_at && (!latest || sub.completed_at > latest)) latest = sub.completed_at;
    });
  });
  return latest;
}

export function LeaderProjectsView({ projects, accounts, members, userEmail, onOpenProject, onOpenMember }) {
  var [amFilter,    setAmFilter]    = useState("all");
  var [acctFilter,  setAcctFilter]  = useState("all");
  var [statusFilter, setStatusFilter] = useState("all");
  var [stuckOnly,   setStuckOnly]   = useState(false);
  var [sort,        setSort]        = useState("due");
  var [expanded,    setExpanded]    = useState({});

  var accountsById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { m[a.id] = a; });
    return m;
  }, [accounts]);

  // List of unique assignees across all projects — for the AM filter.
  var assignees = useMemo(function () {
    var seen = {};
    (projects || []).forEach(function (p) {
      var who = (p.assignee || "").trim();
      if (who) seen[who] = true;
    });
    return Object.keys(seen).sort();
  }, [projects]);

  var rows = useMemo(function () {
    var list = (projects || []).slice();

    // Hide drafts and complete from the leader rollup — they're not signal.
    list = list.filter(function (p) { return p.status !== "draft" && p.status !== "complete"; });

    if (amFilter   !== "all") list = list.filter(function (p) { return (p.assignee || "") === amFilter; });
    if (acctFilter !== "all") list = list.filter(function (p) { return p.account_id === acctFilter; });
    if (statusFilter !== "all") list = list.filter(function (p) { return p.status === statusFilter; });
    if (stuckOnly) {
      list = list.filter(function (p) {
        if (p.status !== "in_progress") return false;
        var last = lastStepCompletedAt(p.stages);
        var ref  = last || p.updated_at || p.created_at;
        var d    = daysSince(ref);
        return d !== null && d > 7;
      });
    }

    // Sort
    list.sort(function (a, b) {
      if (sort === "due") {
        var ad = a.due_date || null, bd = b.due_date || null;
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0;
        return 0;
      }
      if (sort === "progress") {
        var sa = countSteps(a.stages), sb = countSteps(b.stages);
        var pa = sa.total > 0 ? sa.done / sa.total : 0;
        var pb = sb.total > 0 ? sb.done / sb.total : 0;
        return pa - pb;
      }
      if (sort === "stuck") {
        var la = daysSince(lastStepCompletedAt(a.stages) || a.updated_at);
        var lb = daysSince(lastStepCompletedAt(b.stages) || b.updated_at);
        return (lb || 0) - (la || 0);
      }
      return 0;
    });

    return list;
  }, [projects, amFilter, acctFilter, statusFilter, stuckOnly, sort]);

  function clearFilters() {
    setAmFilter("all"); setAcctFilter("all"); setStatusFilter("all"); setStuckOnly(false);
  }

  var hasFilters = amFilter !== "all" || acctFilter !== "all" || statusFilter !== "all" || stuckOnly;

  // Distinct counts for the summary line
  var totalAccts = useMemo(function () {
    var s = {};
    rows.forEach(function (p) { if (p.account_id) s[p.account_id] = true; });
    return Object.keys(s).length;
  }, [rows]);

  return (
    <div>
      {/* Summary line */}
      <div style={{
        fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 14,
      }}>
        {rows.length} project{rows.length !== 1 ? "s" : ""} · {totalAccts} account{totalAccts !== 1 ? "s" : ""}
      </div>

      {/* Filter bar */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        marginBottom: 14, padding: "10px 12px",
        background: C.surface, border: "1px solid " + C.rule, borderRadius: 8,
      }}>
        <FilterSelect
          label="AM"
          value={amFilter}
          onChange={setAmFilter}
          options={[{ value: "all", label: "Anyone" }].concat(assignees.map(function (a) { return { value: a, label: a }; }))}
        />
        <FilterSelect
          label="Account"
          value={acctFilter}
          onChange={setAcctFilter}
          options={[{ value: "all", label: "Any account" }].concat(
            (accounts || [])
              .filter(function (a) { return !a.is_inactive; })
              .map(function (a) { return { value: a.id, label: a.name }; })
          )}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all",         label: "Any status"  },
            { value: "in_progress", label: "In Progress" },
            { value: "blocked",     label: "Blocked"     },
            { value: "planned",     label: "Planned"     },
            { value: "on_hold",     label: "On Hold"     },
          ]}
        />
        <button
          onClick={function () { setStuckOnly(!stuckOnly); }}
          style={{
            background: stuckOnly ? C.accentFaint : "transparent",
            color: stuckOnly ? C.accent : C.textMuted,
            border: "1px solid " + (stuckOnly ? C.accentLine : C.rule),
            borderRadius: 999, padding: "5px 14px",
            fontFamily: INTER, fontSize: 12,
            fontWeight: stuckOnly ? 600 : 500,
            cursor: "pointer", letterSpacing: "0.02em",
          }}
        >
          Stuck &gt;7d
        </button>
        <div style={{ flex: 1 }} />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={setSort}
          options={SORTS.map(function (s) { return { value: s.id, label: s.label }; })}
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: "transparent", color: C.textMuted,
              border: "none", padding: "5px 8px",
              fontFamily: INTER, fontSize: 11, cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 16px", color: C.textMuted, fontSize: 13 }}>
          No projects match these filters.
        </div>
      )}

      {/* Project rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(function (p) {
          var acct        = p.account_id ? accountsById[p.account_id] : null;
          var steps       = countSteps(p.stages);
          var pct         = steps.total > 0 ? Math.round((steps.done / steps.total) * 100) : 0;
          var overdue     = p.status === "in_progress" && isOverdue(p.due_date);
          var statusKey   = (p.status || "planned").split("_").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
          var statusStyle = C["status" + statusKey] || C.statusPlanned;
          var leftEdge    = PRIORITY_COLORS[p.priority];
          var lastDone    = lastStepCompletedAt(p.stages);
          var sinceMove   = daysSince(lastDone || p.updated_at);
          var isStuck     = p.status === "in_progress" && sinceMove !== null && sinceMove > 7;
          var isOpen      = !!expanded[p.id];

          function toggle() { setExpanded(function (prev) { return Object.assign({}, prev, { [p.id]: !prev[p.id] }); }); }

          return (
            <div
              key={p.id}
              style={{
                background: C.surface,
                border: "1px solid " + (p.status === "blocked" ? C.statusBlocked.border : C.rule),
                borderLeft: leftEdge ? "3px solid " + leftEdge : "1px solid " + C.rule,
                borderRadius: 8,
              }}
            >
              <div
                onClick={toggle}
                role="button"
                tabIndex={0}
                onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12, alignItems: "start",
                  padding: "12px 14px",
                  cursor: "pointer",
                }}
              >
                {/* Chevron */}
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted, paddingTop: 3, userSelect: "none" }}>
                  {isOpen ? "▾" : "▸"}
                </div>

                {/* Left: title + chips row */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <div style={{
                      fontFamily: SERIF, fontSize: 16, lineHeight: 1.3,
                      color: overdue ? C.red : C.text,
                    }}>
                      {p.title}
                    </div>
                    <div style={{
                      background: statusStyle.bg,
                      border: "1px solid " + statusStyle.border,
                      borderRadius: 999, padding: "2px 9px",
                      fontFamily: MONO, fontSize: 9.5, color: statusStyle.text,
                      whiteSpace: "nowrap",
                    }}>
                      {STATUS_LABELS[p.status] || p.status}
                    </div>
                    {isStuck && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <div style={{
                          background: "transparent",
                          border: "1px solid " + C.yellow,
                          borderRadius: 999, padding: "2px 9px",
                          fontFamily: MONO, fontSize: 9.5, color: C.yellow,
                          whiteSpace: "nowrap", letterSpacing: "0.06em",
                        }}>
                          STUCK · {sinceMove}D
                        </div>
                        <InfoTip position="below" text="No stage completed in 7+ days. Pip flags this project as potentially blocked. Check in on what's holding it up." />
                      </div>
                    )}
                  </div>

                  {/* Chip row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontFamily: MONO, fontSize: 10 }}>
                    {acct && (
                      <span style={{
                        color: C.textSoft, background: C.accentFaint,
                        border: "1px solid " + C.accentLine,
                        padding: "2px 7px", borderRadius: 4,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        fontWeight: 600,
                      }}>
                        {acct.name}
                      </span>
                    )}
                    {p.assignee && (
                      <span
                        onClick={function (e) {
                          e.stopPropagation();
                          if (onOpenMember) onOpenMember(p.assignee);
                        }}
                        role={onOpenMember ? "button" : undefined}
                        title={"View " + p.assignee + "'s work"}
                        style={{
                          color: C.accent, background: "transparent",
                          border: "1px solid " + C.accentLine,
                          padding: "2px 7px", borderRadius: 4,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          fontWeight: 600,
                          cursor: onOpenMember ? "pointer" : "default",
                        }}
                      >
                        {p.assignee}
                      </span>
                    )}
                    {p.due_date && (
                      <span style={{
                        color: overdue ? C.red : C.textMuted,
                        fontWeight: overdue ? 700 : 500,
                        fontFeatureSettings: '"tnum"',
                      }}>
                        {overdue ? "OVERDUE · " : "DUE · "}{fmt(p.due_date)}
                      </span>
                    )}
                    {sinceMove !== null && !isStuck && lastDone && (
                      <span style={{ color: C.textFaint, fontStyle: "italic" }}>
                        last step {sinceMove}d ago
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: progress */}
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  {steps.total > 0 ? (
                    <>
                      <div style={{
                        fontFamily: MONO, fontSize: 12, fontWeight: 700,
                        color: C.accent, marginBottom: 6, lineHeight: 1.1,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        <span style={{ color: C.text }}>{steps.done}<span style={{ color: C.textMuted }}>/{steps.total}</span></span>
                        <span style={{ color: C.textMuted, margin: "0 5px" }}>·</span>
                        {pct}%
                      </div>
                      <div style={{ position: "relative", height: 4, background: C.surface3, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ position: "absolute", inset: 0, background: C.accent, borderRadius: 2 }} />
                        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: (100 - pct) + "%", background: C.surface3 }} />
                      </div>
                    </>
                  ) : (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint }}>—</span>
                  )}
                </div>
              </div>

              {/* Expanded — stages list */}
              {isOpen && (
                <div style={{ borderTop: "1px solid " + C.rule, padding: "10px 14px 12px 14px" }}>
                  {(p.stages || []).length === 0 ? (
                    <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, padding: "8px 0" }}>
                      No stages defined.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {p.stages.map(function (s, i) {
                        var done = !!s.completed_at;
                        var sOverdue = !done && isOverdue(s.due_date);
                        return (
                          <div
                            key={i}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto 1fr auto auto",
                              gap: 10, alignItems: "center",
                              padding: "6px 10px",
                              background: done ? "transparent" : C.bg,
                              border: "1px solid " + C.rule,
                              borderRadius: 6,
                              opacity: done ? 0.55 : 1,
                            }}
                          >
                            <span style={{
                              width: 16, height: 16, borderRadius: "50%",
                              background: done ? C.accent : "transparent",
                              border: "1px solid " + (done ? C.accent : C.rule),
                              color: C.bg, fontSize: 10, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: MONO, flexShrink: 0,
                            }}>
                              {done ? "✓" : ""}
                            </span>
                            <div style={{
                              fontFamily: SERIF, fontSize: 13.5, color: C.text,
                              textDecoration: done ? "line-through" : "none",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {s.title || ("Step " + (i + 1))}
                            </div>
                            <div style={{
                              fontFamily: MONO, fontSize: 10,
                              color: s.assignee_email ? C.textSoft : C.textFaint,
                            }}>
                              {s.assignee_email || "—"}
                            </div>
                            <div style={{
                              fontFamily: MONO, fontSize: 10,
                              color: sOverdue ? C.red : C.textMuted,
                              fontFeatureSettings: '"tnum"',
                              fontWeight: sOverdue ? 700 : 500,
                              minWidth: 50, textAlign: "right",
                            }}>
                              {fmt(s.due_date) || "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {onOpenProject && (
                    <button
                      onClick={function () { onOpenProject(p.id); }}
                      style={{
                        marginTop: 10,
                        background: "transparent",
                        border: "1px solid " + C.rule,
                        borderRadius: 6, padding: "6px 12px",
                        fontFamily: MONO, fontSize: 10,
                        color: C.textMuted, cursor: "pointer",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Open in Projects view →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </span>
      <select
        value={value}
        onChange={function (e) { onChange(e.target.value); }}
        style={{
          background: C.bg, color: C.text,
          border: "1px solid " + C.rule, borderRadius: 6,
          padding: "4px 8px",
          fontFamily: INTER, fontSize: 12,
          cursor: "pointer",
        }}
      >
        {options.map(function (o) {
          return <option key={o.value} value={o.value}>{o.label}</option>;
        })}
      </select>
    </label>
  );
}
