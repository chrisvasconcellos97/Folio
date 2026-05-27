import { useState, useEffect, useMemo } from "react";
import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

function todayKey() {
  return "folio_banner_dismissed_" + new Date().toISOString().split("T")[0];
}

export function StatusBanner({ accounts, items, meetings, onColdClick, onOverdueClick, onFollowUpClick }) {
  var [dismissed, setDismissed] = useState(function () {
    try { return !!localStorage.getItem(todayKey()); } catch (e) { return false; }
  });

  useEffect(function () {
    function handleStorage() {
      try { setDismissed(!!localStorage.getItem(todayKey())); } catch (e) { /* localStorage may be unavailable */ }
    }
    window.addEventListener("storage", handleStorage);
    return function () { window.removeEventListener("storage", handleStorage); };
  }, []);

  var stats = useMemo(function () {
    var now      = Date.now();
    var todayStr = new Date().toISOString().split("T")[0];
    var weekOut  = (function () { var d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
    var thirtyDaysMs = 30 * 86400000;

    var cold = (accounts || []).filter(function (a) {
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime()
        : a.last_meeting ? new Date(a.last_meeting + "T00:00:00").getTime() : null;
      if (last === null) return true;
      return (now - last) > thirtyDaysMs;
    }).length;

    var overdue = (items || []).filter(function (i) {
      return !i.done && i.due_date && i.due_date < todayStr;
    }).length;

    var followUps = (meetings || []).filter(function (m) {
      return m.follow_up_date && m.follow_up_date >= todayStr && m.follow_up_date <= weekOut;
    }).length;

    return { cold: cold, overdue: overdue, followUps: followUps };
  }, [accounts, items, meetings]);

  if (dismissed) return null;
  if (stats.cold === 0 && stats.overdue === 0 && stats.followUps === 0) return null;

  function dismiss() {
    try { localStorage.setItem(todayKey(), "1"); } catch (e) { /* localStorage may be unavailable */ }
    setDismissed(true);
  }

  var segments = [];
  if (stats.cold > 0)      segments.push({ key: "cold",   label: stats.cold + " account" + (stats.cold !== 1 ? "s" : "") + " going cold", onClick: onColdClick });
  if (stats.overdue > 0)   segments.push({ key: "ov",     label: stats.overdue + " item" + (stats.overdue !== 1 ? "s" : "") + " overdue", onClick: onOverdueClick });
  if (stats.followUps > 0) segments.push({ key: "fu",     label: stats.followUps + " follow-up" + (stats.followUps !== 1 ? "s" : "") + " this week", onClick: onFollowUpClick });

  return (
    <div style={{
      background: C.accentFaint,
      border: "1px solid " + C.accentLine,
      borderLeft: "3px solid " + C.accent,
      borderRadius: 8,
      padding: "9px 14px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12, fontFamily: MONO, color: C.textSub }}>
        {segments.map(function (s, i) {
          return (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: C.textMuted }}>·</span>}
              <button
                onClick={s.onClick}
                disabled={!s.onClick}
                style={{
                  background: "none", border: "none", color: C.accent,
                  fontFamily: MONO, fontSize: 12, fontWeight: 600,
                  cursor: s.onClick ? "pointer" : "default", padding: 0,
                  textDecoration: s.onClick ? "underline" : "none",
                  textUnderlineOffset: 2,
                }}
              >
                {s.label}
              </button>
            </span>
          );
        })}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss banner"
        style={{
          background: "none", border: "none", color: C.textMuted,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}
