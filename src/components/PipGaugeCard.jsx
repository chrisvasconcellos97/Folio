// Gauge-specific Pip card. Taller, denser than PipInsightCard — designed to
// fill the desktop right sidebar with substance instead of a thin one-liner.
//
// Sections:
//   1. Pip narrative line (lens-aware, with glowing tap targets)
//   2. Three-up counters (Due ≤7d / Stuck 7d+ / Shipped 7d)
//   3. Watchlist — top 2-3 projects needing eyes, with reason chip
//   4. No-movement list — in_progress projects with no updated_at activity in 7d+
//   5. Team load — top 3 assignees by open stage count
//
// All sections gracefully hide when empty so a quiet board renders short.

import { PipOrb } from "./PipMark";
import { Glow } from "./Glow";
import { C } from "../lib/colors";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

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
function daysUntil(d) {
  if (!d) return null;
  var t = new Date(d + "T00:00:00").getTime();
  if (!t) return null;
  return Math.floor((t - new Date(new Date().toDateString()).getTime()) / 86400000);
}

export function PipGaugeCard({ projects, accountsById, handlers }) {
  var prjs = projects || [];
  var h    = handlers || {};

  var active  = prjs.filter(function (p) { return p.status === "in_progress"; });
  var blocked = prjs.filter(function (p) { return p.status === "blocked"; });
  var overdue = active.filter(function (p) { return isOverdue(p.due_date); });
  var highPri = active.filter(function (p) { return p.priority === "high"; });
  var stuck   = active.filter(function (p) {
    var d = daysSince(p.updated_at);
    return d !== null && d > 7;
  });
  var dueSoon = active.filter(function (p) {
    var d = daysUntil(p.due_date);
    return d !== null && d >= 0 && d <= 7;
  });
  var shipped = prjs.filter(function (p) {
    if (p.status !== "complete") return false;
    var d = daysSince(p.updated_at);
    return d !== null && d <= 7;
  });

  // Watchlist — overdue first, then blocked, then high-pri. Dedupe, cap 3.
  var seen = {};
  var watchlist = [];
  function push(p, reason, reasonColor) {
    if (!p || seen[p.id] || watchlist.length >= 3) return;
    seen[p.id] = true;
    watchlist.push({ project: p, reason: reason, reasonColor: reasonColor });
  }
  overdue.forEach(function (p) {
    var d = daysUntil(p.due_date);
    var n = Math.abs(d || 0);
    push(p, "OVERDUE · " + n + "D", C.red);
  });
  blocked.forEach(function (p) {
    var label = p.blocked_reason ? "BLOCKED · " + p.blocked_reason : "BLOCKED";
    if (label.length > 38) label = label.slice(0, 35) + "…";
    push(p, label, C.red);
  });
  highPri.forEach(function (p) {
    var d = daysUntil(p.due_date);
    var note = "HIGH PRIORITY";
    if (d !== null && d >= 0 && d <= 7) note += " · DUE " + d + "D";
    push(p, note, C.yellow);
  });

  // Team load — open stages per assignee across active projects
  var loadCounts = {};
  active.forEach(function (p) {
    (p.stages || []).forEach(function (s) {
      if (!s || s.completed_at) return;
      var who = (s.assignee || s.assignee_email || "").trim();
      if (!who) return;
      loadCounts[who] = (loadCounts[who] || 0) + 1;
    });
  });
  var teamLoad = Object.keys(loadCounts)
    .map(function (k) { return { name: k, count: loadCounts[k] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 3);

  // Narrative line — lead with the biggest signal
  var narrative;
  if (overdue.length > 0) {
    narrative = (
      <>
        <Glow onClick={h.onClickOverdue}>{overdue.length} past due</Glow>
        {", " + blocked.length + " blocked, " + active.length + " in flight."} The hot rocks are below — clear those first.
      </>
    );
  } else if (blocked.length > 0) {
    narrative = (
      <>
        <Glow onClick={h.onClickBlocked}>{blocked.length} blocked</Glow>
        {", " + active.length + " active. Unblock the top of the list and the rest of the day opens up."}
      </>
    );
  } else if (active.length > 0) {
    var line = active.length + " project" + (active.length !== 1 ? "s" : "") + " in flight";
    line += shipped.length > 0
      ? ", " + shipped.length + " shipped this week."
      : ", nothing closed this week yet.";
    line += dueSoon.length > 0
      ? " " + dueSoon.length + " due in the next 7."
      : " Clean horizon.";
    narrative = line;
  } else {
    narrative = "Gauge is quiet — no active projects. Either you're between waves, or it's time to start one.";
  }

  var counters = [
    { label: "Due ≤7d",    value: dueSoon.length, color: C.accent },
    { label: "Stuck 7d+",  value: stuck.length,   color: C.yellow },
    { label: "Shipped 7d", value: shipped.length, color: C.statusComplete.text },
  ];

  return (
    <div style={{
      background: "var(--c-pip-card-bg)",
      border: "1px solid " + C.accentBorder,
      borderRadius: 10,
      padding: "16px 16px 14px",
      boxShadow: "var(--c-pip-card-shadow)",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Header + narrative */}
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
        <PipOrb size="md" />
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.accent,
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
          }}>
            Pip on Gauge
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.textSoft, lineHeight: 1.55 }}>
            {narrative}
          </div>
        </div>
      </div>

      {/* Three-up counters */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 1,
        background: C.rule,
        borderRadius: 6,
        overflow: "hidden",
      }}>
        {counters.map(function (s) {
          return (
            <div key={s.label} style={{
              background: C.surface, padding: "8px 6px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: SERIF, fontSize: 18, lineHeight: 1,
                color: s.value > 0 ? s.color : C.textFaint,
                fontFeatureSettings: '"tnum"',
              }}>
                {s.value > 0 ? s.value : "—"}
              </div>
              <div style={{
                fontFamily: MONO, fontSize: 8.5, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4,
              }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
          }}>
            Watchlist
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {watchlist.map(function (w) {
              var acct = w.project.account_id ? accountsById[w.project.account_id] : null;
              return (
                <div
                  key={w.project.id}
                  onClick={function () { if (h.onClickProject) h.onClickProject(w.project.id); }}
                  role={h.onClickProject ? "button" : undefined}
                  tabIndex={h.onClickProject ? 0 : undefined}
                  style={{
                    cursor: h.onClickProject ? "pointer" : "default",
                    padding: "8px 10px",
                    border: "1px solid " + C.rule,
                    borderLeft: "3px solid " + (w.reasonColor || C.accent),
                    borderRadius: 6,
                    background: C.surface,
                  }}
                >
                  <div style={{
                    fontFamily: SERIF, fontSize: 13, color: C.text, lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {w.project.title}
                  </div>
                  <div style={{
                    display: "flex", gap: 6, alignItems: "center", marginTop: 4,
                    fontFamily: MONO, fontSize: 9.5,
                  }}>
                    <span style={{
                      color: w.reasonColor || C.accent, fontWeight: 700,
                      letterSpacing: "0.05em",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      minWidth: 0,
                    }}>
                      {w.reason}
                    </span>
                    {acct && (
                      <span style={{
                        color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}>
                        · {acct.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No movement list (stuck) */}
      {stuck.length > 0 && (
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
          }}>
            No movement in a week
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {stuck.slice(0, 3).map(function (p) {
              var d = daysSince(p.updated_at);
              return (
                <div
                  key={p.id}
                  onClick={function () { if (h.onClickProject) h.onClickProject(p.id); }}
                  role={h.onClickProject ? "button" : undefined}
                  tabIndex={h.onClickProject ? 0 : undefined}
                  style={{
                    cursor: h.onClickProject ? "pointer" : "default",
                    display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                    fontFamily: INTER, fontSize: 12,
                  }}
                >
                  <span style={{
                    color: C.textSoft,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.title}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 10, color: C.yellow,
                    fontFeatureSettings: '"tnum"', whiteSpace: "nowrap",
                  }}>
                    {d}d
                  </span>
                </div>
              );
            })}
            {stuck.length > 3 && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, marginTop: 2 }}>
                + {stuck.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Team load */}
      {teamLoad.length > 0 && (
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
          }}>
            Team load
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {teamLoad.map(function (t) {
              return (
                <div key={t.name} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  fontFamily: INTER, fontSize: 12,
                }}>
                  <span style={{
                    color: C.textSoft,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginRight: 8,
                  }}>
                    {t.name}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 10, color: C.accent,
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {t.count} open
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
