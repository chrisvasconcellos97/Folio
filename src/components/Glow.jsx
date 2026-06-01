import { C } from "../lib/colors";

// Inline clickable highlight inside Pip's prose. Used by PipInsightCard
// and StatusBanner. Reserve for HOT items only (past due, overdue, urgent)
// so the glow stays meaningful — not every stat needs to glow.
export function Glow({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: "none",
        border: "none",
        padding: "2px 0",
        margin: "-2px 0",
        font: "inherit",
        fontWeight: 600,
        color: C.accent,
        textDecoration: onClick ? "underline" : "none",
        textUnderlineOffset: 3,
        textDecorationColor: C.accentLine,
        textDecorationThickness: "1px",
        cursor: onClick ? "pointer" : "default",
        letterSpacing: "inherit",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}
