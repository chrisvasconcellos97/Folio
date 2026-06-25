import { useMemo } from "react";
import { C } from "../../lib/colors";
import { usePipAssignmentHints } from "../../hooks/usePipAssignmentHints";
import { ownerLabel } from "../../lib/ownerLabel";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// "What Pip has learned" (item 54) — makes the silent assignment-hint engine
// VISIBLE and CONTROLLABLE. Pip already learns who Chris assigns to which kind
// of work and auto-applies it in summarize; this surfaces those learned defaults
// so he can SEE them and remove any that are wrong (consent / undo). The "Pip is
// learning me" payoff, plus a control he can trust.
export function LearnedDefaultsSection({ userId, accounts, members }) {
  var hintsApi = usePipAssignmentHints(userId, null);

  // Group identical (pattern + assignee) hints; an org-wide hint (account_id null)
  // and its per-account seeds collapse into one row with a scope note.
  var rows = useMemo(function () {
    var byKey = {};
    (hintsApi.hints || []).forEach(function (h) {
      var key = h.task_pattern + "|" + h.assignee_email;
      if (!byKey[key]) byKey[key] = { id: h.id, pattern: h.task_pattern, assignee: h.assignee_email, count: 0, orgWide: false, ids: [] };
      byKey[key].count += 1;
      byKey[key].ids.push(h.id);
      if (!h.account_id) byKey[key].orgWide = true;
    });
    return Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }, [hintsApi.hints]);

  function nameFor(email) {
    if (!email) return "someone";
    var m = (members || []).find(function (x) {
      return x.email === email || x.invited_email === email || x.user_id === email;
    });
    if (m) return ownerLabel(m);
    return String(email).split("@")[0] || email;
  }

  function removeRow(row) {
    // Remove every hint backing this learned default.
    row.ids.forEach(function (id) { hintsApi.removeHint(id); });
  }

  return (
    <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
        What Pip has learned about how you work
      </div>
      <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, fontFamily: INTER, marginBottom: 10 }}>
        When you reassign a task Pip suggested, it remembers — and starts defaulting that kind of work to that person. Here's what it's picked up. Remove any that are wrong.
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.textMuted, fontFamily: INTER, fontStyle: "italic" }}>
          Nothing yet. Reassign a task in a meeting summary a few times and Pip will start learning your defaults.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(function (row) {
            return (
              <div key={row.pattern + row.assignee} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: C.bgCard, border: "1px solid " + C.border, borderRadius: 9, padding: "9px 12px",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text, fontFamily: INTER }}>
                    Assigns <strong>{nameFor(row.assignee)}</strong> to <span style={{ color: C.textSub }}>"{row.pattern}"</span> tasks
                  </div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: MONO, marginTop: 1 }}>
                    learned from {row.count} {row.count === 1 ? "override" : "overrides"}{row.orgWide ? " · applies across all accounts" : ""}
                  </div>
                </div>
                <button
                  onClick={function () { removeRow(row); }}
                  style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 7, padding: "5px 10px", fontSize: 11, color: C.textMuted, fontFamily: INTER, cursor: "pointer", flexShrink: 0 }}
                >
                  Forget
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
