// ─── Folio Theme ─────────────────────────────────────────────────────────────
// To retheme: update the hex value AND its _rgb companion below.
// All derived rgba tokens auto-update from the _rgb string — nothing else
// needs touching for a full recolor.
// ─────────────────────────────────────────────────────────────────────────────

var _accent = "78,175,135";   // #4EAF87
var _red    = "224,92,92";    // #E05C5C
var _yellow = "232,168,56";   // #E8A838
var _blue   = "123,108,246";  // #7B6CF6

export const C = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  bg:           "#0D1F1C",
  bgCard:       "#142420",
  bgCardAlt:    "#1A2E2A",
  bgDark:       "#091712",
  bgPill:       "#1e3530",
  bgPillActive: "#2a4a42",

  // ── Accent ───────────────────────────────────────────────────────────────
  accent:       "#4EAF87",
  accentDim:    "#2D7A5A",
  accentGlow:   "rgba(" + _accent + ",0.12)",
  accentFaint:  "rgba(" + _accent + ",0.08)",
  accentMid:    "rgba(" + _accent + ",0.15)",
  accentSubtle: "rgba(" + _accent + ",0.30)",
  accentLine:   "rgba(" + _accent + ",0.2)",
  accentRing:   "rgba(" + _accent + ",0.35)",
  accentBorder: "rgba(" + _accent + ",0.4)",
  accentShadow: "rgba(" + _accent + ",0.22)",

  // ── Status ───────────────────────────────────────────────────────────────
  green:  "#4EAF87",
  yellow: "#E8A838",
  red:    "#E05C5C",
  blue:   "#7B6CF6",
  purple: "#7B6CF6",

  // ── Status derived ───────────────────────────────────────────────────────
  redFaint:    "rgba(" + _red    + ",0.12)",
  redLine:     "rgba(" + _red    + ",0.2)",
  yellowFaint: "rgba(" + _yellow + ",0.12)",
  blueFaint:   "rgba(" + _blue   + ",0.12)",
  blueLine:    "rgba(" + _blue   + ",0.2)",

  // ── Text ─────────────────────────────────────────────────────────────────
  text:      "#E8F0EC",
  textSub:   "#8BA89E",
  textMuted: "#567A70",

  // ── Borders ──────────────────────────────────────────────────────────────
  border:       "#1e3530",
  borderBright: "#2a4a42",

  // ── Dropdown ─────────────────────────────────────────────────────────────
  bgDropdown:   "#1a2b28",
};

export function hexToRgb(hex) {
  if (!hex || hex[0] !== "#") return "0,0,0";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return r + "," + g + "," + b;
}
