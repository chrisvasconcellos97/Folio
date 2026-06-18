// Gauge V3 Phase 5 — read-only teammate drill-in.
//
// Reached from the Leader view by clicking an AM chip. Shows what's
// on that teammate's plate without giving the leader edit access:
//   - Header: their email + "back to Leader view" button
//   - Open tasks list (from folio_tasks, filtered by assignee_email)
//   - Project stages assigned to them across all projects
//   - Accounts they own (derived from projects.assignee)
//
// All read-only — no edit buttons, no checkboxes, no detail panels.
// The point is visibility, not mutation. Edits stay with the owner.

import { useMemo } from "react";
import { useTasks } from "../../hooks/useTasks";
import { C } from "../../lib/colors";
import { fmtShort } from "../../lib/dateUtils";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

function fmt(d) {
  if (!d) return null;
  return fmtShort(d) || null;
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d + "T00:00:00") < new Date(new Date().toDateString());
}

export function TeammateDetailView({ userId, memberEmail, projects, accounts, onBack }) {
  // Pull their open tasks. Note: filtered by assignee_email on the server.
  // Org-scoped sharing happens at the RLS layer (folio_tasks visible to org
  // members) so the leader sees what they're supposed to see.
  // orgScope drops the caller's user_id filter so a leader can read the
  // teammate's tasks (by assignee_email) via the folio_tasks org-read RLS policy.
  var { tasks } = useTasks(userId, { assigneeEmail: memberEmail, openOnly: true, orgScope: true });

  var accountsById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { m[a.id] = a; });
    return m;
  }, [accounts]);

  // Projects this teammate is assignee on (top-level), plus projects
  // where any stage's assignee_email matches them.
  var theirProjects = useMemo(function () {
    var seen = {};
    var out = [];
    (projects || []).forEach(function (p) {
      var matches = false;
      if (p.assignee && p.assignee === memberEmail) matches = true;
      (p.tasks || []).forEach(function (s) {
        if (s.assignee_email === memberEmail) matches = true;
      });
      if (matches && !seen[p.id]) { seen[p.id] = true; out.push(p); }
    });
    return out;
  }, [projects, memberEmail]);

  // Their open stages across every project — flat list.
  var theirStages = useMemo(function () {
    var rows = [];
    (projects || []).forEach(function (p) {
      (p.tasks || []).forEach(function (s, i) {
        if (s.assignee_email === memberEmail && !s.completed_at) {
          rows.push({
            stage: s, index: i,
            projectId: p.id, projectTitle: p.title,
            accountId: p.account_id,
          });
        }
      });
    });
    rows.sort(function (a, b) {
      var ad = a.stage.due_date || null, bd = b.stage.due_date || null;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : 0;
      return 0;
    });
    return rows;
  }, [projects, memberEmail]);

  // Accounts they touch (across projects + stages, including account_ids[]).
  var theirAccountIds = useMemo(function () {
    var s = {};
    theirProjects.forEach(function (p) {
      if (p.account_id) s[p.account_id] = true;
      if (Array.isArray(p.account_ids)) p.account_ids.forEach(function (id) { if (id) s[id] = true; });
    });
    return Object.keys(s);
  }, [theirProjects]);

  return (
    <div>
      {/* Header + back */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: "1px solid " + C.rule,
            borderRadius: 6, padding: "5px 12px",
            fontFamily: MONO, fontSize: 10, color: C.textMuted,
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          ← Back
        </button>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Read-only
        </div>
      </div>

      <div style={{
        fontFamily: SERIF, fontSize: 24, lineHeight: 1.2,
        color: C.text, marginBottom: 4,
      }}>
        {memberEmail}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 11, color: C.textMuted,
        marginBottom: 22,
      }}>
        {tasks.length} open task{tasks.length !== 1 ? "s" : ""} ·
        {" "}{theirStages.length} project stage{theirStages.length !== 1 ? "s" : ""} ·
        {" "}{theirProjects.length} project{theirProjects.length !== 1 ? "s" : ""} on
        {" "}{theirAccountIds.length} account{theirAccountIds.length !== 1 ? "s" : ""}
      </div>

      {/* Open tasks */}
      <Section title="Open tasks">
        {tasks.length === 0 ? (
          <EmptyLine>Nothing in the task queue.</EmptyLine>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tasks.map(function (t) {
              var overdue = isOverdue(t.due_date);
              var acct    = t.account_id ? accountsById[t.account_id] : null;
              return (
                <div key={t.id} style={cardStyle(overdue)}>
                  <div style={{
                    fontFamily: SERIF, fontSize: 14, color: C.text, lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {t.title}
                  </div>
                  <ChipRow>
                    {acct && <AcctChip>{acct.name}</AcctChip>}
                    {t.due_date && <DueChip overdue={overdue}>{(overdue ? "OVERDUE · " : "DUE · ") + fmt(t.due_date)}</DueChip>}
                  </ChipRow>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Open project stages */}
      <Section title="Open project stages">
        {theirStages.length === 0 ? (
          <EmptyLine>No open stages assigned.</EmptyLine>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {theirStages.map(function (r) {
              var overdue = isOverdue(r.stage.due_date);
              var acct    = r.accountId ? accountsById[r.accountId] : null;
              return (
                <div key={r.projectId + "-" + r.index} style={cardStyle(overdue)}>
                  <div style={{
                    fontFamily: SERIF, fontSize: 14, color: C.text, lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {r.stage.title || ("Step " + (r.index + 1))}
                  </div>
                  <ChipRow>
                    {acct && <AcctChip>{acct.name}</AcctChip>}
                    <ProjectChip>{r.projectTitle}</ProjectChip>
                    {r.stage.due_date && <DueChip overdue={overdue}>{(overdue ? "OVERDUE · " : "DUE · ") + fmt(r.stage.due_date)}</DueChip>}
                  </ChipRow>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Projects they're on */}
      <Section title="Projects they're on">
        {theirProjects.length === 0 ? (
          <EmptyLine>Not on any active projects.</EmptyLine>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {theirProjects.map(function (p) {
              var acct  = p.account_id ? accountsById[p.account_id] : null;
              var total = (p.tasks || []).length;
              var done  = (p.tasks || []).filter(function (s) { return s.completed_at; }).length;
              var pct   = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={p.id} style={cardStyle(false)}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
                  }}>
                    <div style={{
                      fontFamily: SERIF, fontSize: 14, color: C.text, lineHeight: 1.3,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      flex: 1, minWidth: 0,
                    }}>
                      {p.title}
                    </div>
                    {total > 0 && (
                      <div style={{
                        fontFamily: MONO, fontSize: 11, color: C.accent, fontVariantNumeric: "tabular-nums",
                      }}>
                        {done}/{total} · {pct}%
                      </div>
                    )}
                  </div>
                  <ChipRow>
                    {acct && <AcctChip>{acct.name}</AcctChip>}
                  </ChipRow>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, color: C.textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyLine({ children }) {
  return (
    <div style={{
      padding: "12px 14px", color: C.textMuted, fontSize: 13,
      fontFamily: INTER,
      background: C.surface, border: "1px dashed " + C.rule, borderRadius: 8,
    }}>
      {children}
    </div>
  );
}

function cardStyle(overdue) {
  return {
    padding: "10px 12px",
    background: C.surface,
    border: "1px solid " + C.rule,
    borderLeft: overdue ? "3px solid " + C.red : "1px solid " + C.rule,
    borderRadius: 8,
  };
}

function ChipRow({ children }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6,
      alignItems: "center", fontFamily: MONO, fontSize: 10,
    }}>
      {children}
    </div>
  );
}

function AcctChip({ children }) {
  return (
    <span style={{
      color: C.textSoft, background: C.accentFaint,
      border: "1px solid " + C.accentLine,
      padding: "2px 7px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function ProjectChip({ children }) {
  return (
    <span style={{
      color: C.textMuted, background: "transparent",
      border: "1px solid " + C.rule,
      padding: "2px 7px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function DueChip({ overdue, children }) {
  return (
    <span style={{
      color: overdue ? C.red : C.textMuted,
      fontWeight: overdue ? 700 : 500,
      fontFeatureSettings: '"tnum"',
    }}>
      {children}
    </span>
  );
}
