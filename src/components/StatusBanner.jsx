import { useMemo } from "react";
import { C } from "../lib/colors";
import { PipOrb } from "./PipMark";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

export function StatusBanner({ accounts, items, meetings, onColdClick, onOverdueClick, onFollowUpClick }) {
  // One-time purge of leftover per-day dismiss flags from the prior behavior.
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("folio_banner_dismissed_") === 0) localStorage.removeItem(k);
    });
  } catch (e) {}

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

  if (stats.cold === 0 && stats.overdue === 0 && stats.followUps === 0) return null;

  var segments = [];
  if (stats.cold > 0)      segments.push({ key: "cold", label: stats.cold + " account" + (stats.cold !== 1 ? "s" : "") + " going cold", onClick: onColdClick });
  if (stats.overdue > 0)   segments.push({ key: "ov",   label: stats.overdue + " item"   + (stats.overdue !== 1 ? "s" : "") + " overdue",      onClick: onOverdueClick });
  if (stats.followUps > 0) segments.push({ key: "fu",   label: stats.followUps + " follow-up" + (stats.followUps !== 1 ? "s" : "") + " this week", onClick: onFollowUpClick });

  return (
    <div style={{
      background: "oklch(0.18 0.025 178 / 0.5)",
      border: "1px solid " + C.accentBorder,
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 12,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
        <PipOrb size="md" />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Pip Noticed
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textSoft, lineHeight: 1.5, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
            {segments.map(function (s, i) {
              return (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                  {i > 0 && <span style={{ color: C.textMuted, fontSize: 13 }}>·</span>}
                  <button
                    onClick={s.onClick}
                    disabled={!s.onClick}
                    style={{
                      background: "none", border: "none", color: C.accent,
                      fontFamily: SERIF, fontSize: 15, fontWeight: 400,
                      cursor: s.onClick ? "pointer" : "default", padding: 0,
                      textDecoration: s.onClick ? "underline" : "none",
                      textUnderlineOffset: 3,
                      textDecorationColor: C.accentLine,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {s.label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
