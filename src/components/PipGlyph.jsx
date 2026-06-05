import { C } from "../lib/colors.js";

// Pip's own inline status glyphs — a small fixed set in the Mark/Pip visual
// language (thin geometric strokes, theme-token colors), used in place of
// unicode emoji inside briefs and summaries. Pip emits a whitelisted token
// (e.g. ":fire:") and MarkdownText swaps it for the matching glyph. Unknown
// tokens are left untouched, so nothing can leak a raw ":word:" into the UI.
//
// Keep this set SMALL and stable so Pip uses them reliably and they always
// render. Add a new glyph here AND to GLYPH_NAMES below before referencing it
// in any prompt.

export var GLYPH_NAMES = ["fire", "watch", "win", "signal", "done", "flag"];

function svg(color, children) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

var GLYPHS = {
  // needs-you-now — alert triangle (terracotta)
  fire: svg(C.red, [
    <path key="t" d="M8 2.4 L14 13 H2 Z" fill="none" stroke={C.red} strokeWidth="1.5" strokeLinejoin="round" />,
    <line key="l" x1="8" y1="6.4" x2="8" y2="9.6" stroke={C.red} strokeWidth="1.5" strokeLinecap="round" />,
    <circle key="d" cx="8" cy="11.4" r="0.95" fill={C.red} />,
  ]),
  // keep-an-eye — eye (ochre / amber)
  watch: svg(C.yellow, [
    <path key="e" d="M1.6 8 C4 4.2 12 4.2 14.4 8 C12 11.8 4 11.8 1.6 8 Z" fill="none" stroke={C.yellow} strokeWidth="1.4" strokeLinejoin="round" />,
    <circle key="p" cx="8" cy="8" r="2.1" fill={C.yellow} />,
  ]),
  // good news / win — four-point spark (teal, echoes Pip's ✦)
  win: svg(C.accent, [
    <path key="s" d="M8 1 L9.5 6.5 L15 8 L9.5 9.5 L8 15 L6.5 9.5 L1 8 L6.5 6.5 Z" fill={C.accent} />,
  ]),
  // cross-account pattern — broadcast arcs (blue)
  signal: svg(C.blue, [
    <circle key="d" cx="8" cy="11.2" r="1.5" fill={C.blue} />,
    <path key="a1" d="M4.6 8.6 a4.8 4.8 0 0 1 6.8 0" fill="none" stroke={C.blue} strokeWidth="1.4" strokeLinecap="round" />,
    <path key="a2" d="M2.6 6.2 a8 8 0 0 1 10.8 0" fill="none" stroke={C.blue} strokeWidth="1.4" strokeLinecap="round" />,
  ]),
  // shipped / closed — check (teal)
  done: svg(C.accent, [
    <path key="c" d="M3 8.4 L6.4 12 L13 4.6" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  ]),
  // neutral marker — flag (muted)
  flag: svg(C.textMuted, [
    <line key="p" x1="4" y1="2.2" x2="4" y2="14" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round" />,
    <path key="f" d="M4 3 H12 L10 5.6 L12 8.2 H4 Z" fill={C.textMuted} />,
  ]),
};

export function PipGlyph({ name, size }) {
  var g = GLYPHS[name];
  if (!g) return null;
  var s = size || "1em";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: s,
        height: s,
        marginRight: "0.36em",
        verticalAlign: "-0.13em",
        flex: "0 0 auto",
      }}
    >
      {g}
    </span>
  );
}
