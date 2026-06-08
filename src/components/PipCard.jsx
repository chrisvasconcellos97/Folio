import { useState } from "react";
import { C } from "../lib/colors";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// PipCard — the one shared Pip surface anatomy used everywhere:
//   HEAD (always visible): "✦ PIP" label + timestamp, a high-level headline,
//   and a density row of meta chips.
//   BODY (children, collapsed by default): the full breakdown.
//
// Every operator surface (account, cadence, gauge, home) composes this same
// shell so Pip reads as one assistant, not five widgets: high-level first,
// details on tap. When there are no children it's just a head (the
// shallow-water fallback for accounts the loop hasn't worked yet).
export function PipCard({ label, headline, timestamp, metaChips, children, defaultCollapsed, unread, onRead }) {
  var hasBody = !!children;
  var [collapsed, setCollapsed] = useState(defaultCollapsed !== false);

  if (!headline && !hasBody) return null;

  var chips = (metaChips || []).filter(Boolean);

  function toggle() {
    if (!hasBody) return;
    var willExpand = collapsed;
    setCollapsed(!collapsed);
    // Opening an unread card marks it read — the glow clears.
    if (willExpand && unread && onRead) onRead();
  }

  return (
    <div
      className={unread ? "pip-unread" : undefined}
      style={{
        background: C.surface,
        border: "1px solid " + C.rule,
        borderLeft: "2px solid " + C.accent,
        borderRadius: 12,
        padding: "13px 15px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: headline ? 7 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ✦ Pip{label ? " · " + label : ""}
          </div>
          {unread && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: C.yellow, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.yellow, display: "inline-block" }} />
              New
            </span>
          )}
        </div>
        {timestamp && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            {timestamp}
          </span>
        )}
      </div>

      {/* Head — clickable to expand the body when there is one */}
      <div
        onClick={toggle}
        role={hasBody ? "button" : undefined}
        style={{ cursor: hasBody ? "pointer" : "default" }}
      >
        {headline && (
          <div style={{ fontFamily: INTER, fontSize: 14.5, color: C.textSoft, lineHeight: 1.55, fontWeight: 500 }}>
            {headline}
          </div>
        )}

        {(chips.length > 0 || hasBody) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: headline ? 9 : 0, flexWrap: "wrap" }}>
            {chips.map(function (c, i) {
              return (
                <span key={i} style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, letterSpacing: "0.02em" }}>
                  {c}
                </span>
              );
            })}
            {hasBody && (
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: C.accent }}>
                {collapsed ? "Show details ▾" : "Hide ▴"}
              </span>
            )}
          </div>
        )}
      </div>

      {hasBody && !collapsed && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.rule }}>
          {children}
        </div>
      )}
    </div>
  );
}
