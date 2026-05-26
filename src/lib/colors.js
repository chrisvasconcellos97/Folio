// ─── Folio Theme — Redesign v2 ────────────────────────────────────────────────
// Accent RGB: 77,184,150 (#4db896)
// ─────────────────────────────────────────────────────────────────────────────

var _accent = "77,184,150";   // #4db896
var _red    = "200,90,62";    // #c85a3e
var _yellow = "212,147,42";   // #d4932a
var _blue   = "91,143,212";   // #5b8fd4

export const C = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  bg:           "#07100f",
  surface:      "#0c1615",
  surface2:     "#11201e",
  surface3:     "#162927",
  bgDropdown:   "#1a2b28",

  // Legacy aliases (keep for backward compat)
  bgCard:       "#0c1615",
  bgCardAlt:    "#11201e",
  bgDark:       "#07100f",
  bgPill:       "#1a2b28",
  bgPillActive: "oklch(0.22 0.04 178 / 0.5)",

  // ── Accent ───────────────────────────────────────────────────────────────
  accent:       "#4db896",
  accentDeep:   "#2d8f70",
  accentDim:    "#1a5c47",
  accentGlow:   "rgba(" + _accent + ",0.14)",
  accentGlow2:  "rgba(" + _accent + ",0.22)",
  accentFaint:  "rgba(" + _accent + ",0.08)",
  accentMid:    "rgba(" + _accent + ",0.15)",
  accentSubtle: "rgba(" + _accent + ",0.30)",
  accentLine:   "rgba(" + _accent + ",0.2)",
  accentRing:   "rgba(" + _accent + ",0.35)",
  accentBorder: "rgba(" + _accent + ",0.42)",
  accentShadow: "rgba(" + _accent + ",0.55)",

  // ── Borders / rules ───────────────────────────────────────────────────────
  rule:         "#1c2c2a",
  ruleSoft:     "#15201f",

  // Legacy aliases
  border:       "#1c2c2a",
  borderBright: "#15201f",

  // ── Status ───────────────────────────────────────────────────────────────
  green:  "#4db896",
  yellow: "#d4932a",
  red:    "#c85a3e",
  blue:   "#5b8fd4",
  purple: "#7B6CF6",

  // ── Status derived ───────────────────────────────────────────────────────
  redFaint:    "rgba(" + _red    + ",0.12)",
  redLine:     "rgba(" + _red    + ",0.2)",
  yellowFaint: "rgba(" + _yellow + ",0.12)",
  blueFaint:   "rgba(" + _blue   + ",0.12)",
  blueLine:    "rgba(" + _blue   + ",0.2)",

  // ── Gauge status pill colors ──────────────────────────────────────────────
  statusPlanned:    { text: "#7ab0e8", bg: "rgba(40,60,110,0.5)",  border: "#4a80c8" },
  statusInProgress: { text: "#4db896", bg: "rgba(30,70,55,0.5)",   border: "rgba(77,184,150,0.42)" },
  statusBlocked:    { text: "#e06040", bg: "rgba(80,30,20,0.5)",   border: "#b84830" },
  statusOnHold:     { text: "#7a8c8a", bg: "rgba(30,40,40,0.6)",   border: "#506060" },
  statusComplete:   { text: "#5dc890", bg: "rgba(20,65,45,0.5)",   border: "#3a9060" },

  // ── Text ─────────────────────────────────────────────────────────────────
  text:      "#e7ece9",
  textSoft:  "#aebbb6",
  textMuted: "#6f7c79",
  textFaint: "#475251",

  // Legacy aliases
  textSub:   "#aebbb6",
};

export var glass = {
  background: "rgba(12,22,21,0.85)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.05)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
};

export function hexToRgb(hex) {
  if (!hex || hex[0] !== "#") return "0,0,0";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return r + "," + g + "," + b;
}
