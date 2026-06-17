import { C } from "../lib/colors";

// Inline clickable highlight inside Pip's prose. Used by PipInsightCard
// and StatusBanner. Reserve for HOT items only (past due, overdue, urgent)
// so the glow stays meaningful — not every stat needs to glow.
//
// When there's no onClick handler (or asSpan=true), renders a <span> so the
// DOM stays semantically correct — a <button> with no action is invalid.
export function Glow({ onClick, children, asSpan }) {
  var isSpan = asSpan || !onClick;
  var sharedStyle = {
    background: "none",
    border: "none",
    padding: "2px 0",
    margin: "-2px 0",
    font: "inherit",
    fontWeight: 600,
    color: C.accent,
    textDecoration: onClick && !isSpan ? "underline" : "none",
    textUnderlineOffset: 3,
    textDecorationColor: C.accentLine,
    textDecorationThickness: "1px",
    cursor: onClick ? "pointer" : "default",
    letterSpacing: "inherit",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    display: "inline",
  };

  if (isSpan) {
    return (
      <span style={sharedStyle}>
        {children}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      style={sharedStyle}
    >
      {children}
    </button>
  );
}
