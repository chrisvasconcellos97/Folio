// Backward-compat shim — old NavMark API delegates to the new unified Mark
// component. Existing callers that still pass `id` + `size` keep working;
// the underlying disc chrome + glyph come from src/components/Mark.jsx.
//
// `MARKS` is still exported as a no-op shape for any code that used the
// raw glyph render fns (no consumers do today, but the lookup is cheap and
// keeps the legacy contract).

import { Mark } from "./Mark";

// Legacy aliases preserved so existing imports keep resolving the same tab id.
var ALIASES = {
  workspaces: "accounts",
  routes:     "route",
  // 'diagnostics' has no canonical disc glyph in the new spec; fall back to
  // the existing exclamation-in-circle by rendering nothing through Mark.
};

export function NavMark({ id, size }) {
  if (!id) return null;
  var tab = ALIASES[id] || id;
  if (tab === "diagnostics") {
    // Diagnostics keeps its own inline glyph — disc chrome + ! mark.
    return (
      <span
        style={{
          width: size || 22, height: size || 22, borderRadius: "50%",
          display: "inline-grid", placeItems: "center",
          background: "var(--c-folio-tint-2)",
          border: "1px solid var(--c-folio-border)",
          boxShadow: "0 0 " + Math.round((size || 22) * 0.45) + "px var(--c-folio-shadow)",
          color: "var(--c-folio-deep)",
        }}
        aria-hidden="true"
      >
        <svg width={Math.round((size || 22) * 0.5)} height={Math.round((size || 22) * 0.5)} viewBox="-10 -10 20 20" style={{ display: "block" }}>
          <circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="0" y1="-3.5" x2="0" y2="1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="0" cy="4" r="0.95" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return <Mark tab={tab} size={size || 22} />;
}

// No-op export so anything that imported MARKS still resolves.
export var MARKS = {};
