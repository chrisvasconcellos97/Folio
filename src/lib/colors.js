// ─── Folio Theme — Token swap via CSS custom properties ──────────────────────
// Every value below is a `var(--…)` reference. The actual hex/oklch values
// live in index.html (CSS vars on :root[data-theme="dark"|"light"]). Switch
// themes by toggling `document.documentElement.dataset.theme` — every consumer
// of `C` automatically resolves through the current palette.
//
// NOTE — anything NEW (animations, halos, hover-lifts) that's gated to the
// light theme lives under `[data-theme="light"]` selectors in index.html.
// Dark behavior is unchanged by this refactor.
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  bg:           "var(--c-bg)",
  surface:      "var(--c-surface)",
  surface2:     "var(--c-surface-2)",
  surface3:     "var(--c-surface-3)",
  bgDropdown:   "var(--c-bg-dropdown)",

  // Legacy aliases (keep for backward compat)
  bgCard:       "var(--c-surface)",
  bgCardAlt:    "var(--c-surface-2)",
  bgDark:       "var(--c-bg)",
  bgPill:       "var(--c-bg-dropdown)",
  bgPillActive: "var(--c-bg-pill-active)",

  // ── Accent ───────────────────────────────────────────────────────────────
  accent:       "var(--c-accent)",
  onAccent:     "var(--c-on-accent)", // text/glyph color that stays readable on an accent-filled surface
  accentHi:     "var(--c-accent-hi)",
  accentDeep:   "var(--c-accent-deep)",
  accentDim:    "var(--c-accent-dim)",
  accentGlow:   "var(--c-accent-glow)",
  accentGlow2:  "var(--c-accent-glow-2)",
  accentFaint:  "var(--c-accent-faint)",
  accentMid:    "var(--c-accent-mid)",
  accentSubtle: "var(--c-accent-subtle)",
  accentLine:   "var(--c-accent-line)",
  accentRing:   "var(--c-accent-ring)",
  accentBorder: "var(--c-accent-border)",
  accentShadow: "var(--c-accent-shadow)",
  folioShadow:  "var(--c-folio-shadow)",

  // ── Borders / rules ───────────────────────────────────────────────────────
  rule:         "var(--c-rule)",
  ruleSoft:     "var(--c-rule-soft)",

  // Legacy aliases
  border:       "var(--c-rule)",
  borderBright: "var(--c-rule-soft)",

  // ── Status ───────────────────────────────────────────────────────────────
  green:  "var(--c-green)",
  yellow: "var(--c-yellow)",
  red:    "var(--c-red)",
  blue:   "var(--c-blue)",
  purple: "var(--c-purple)",

  // ── Status derived ───────────────────────────────────────────────────────
  redFaint:    "var(--c-red-faint)",
  redLine:     "var(--c-red-line)",
  yellowFaint: "var(--c-yellow-faint)",
  greenFaint:  "var(--c-green-faint)",
  blueFaint:   "var(--c-blue-faint)",
  blueLine:    "var(--c-blue-line)",

  // ── Gauge status pill colors ──────────────────────────────────────────────
  // Each property uses CSS vars so the pills re-theme correctly.
  statusDraft:      { text: "var(--c-status-draft-text)",      bg: "var(--c-status-draft-bg)",      border: "var(--c-status-draft-border)" },
  statusPlanned:    { text: "var(--c-status-planned-text)",    bg: "var(--c-status-planned-bg)",    border: "var(--c-status-planned-border)" },
  statusInProgress: { text: "var(--c-status-progress-text)",   bg: "var(--c-status-progress-bg)",   border: "var(--c-status-progress-border)" },
  statusBlocked:    { text: "var(--c-status-blocked-text)",    bg: "var(--c-status-blocked-bg)",    border: "var(--c-status-blocked-border)" },
  statusOnHold:     { text: "var(--c-status-onhold-text)",     bg: "var(--c-status-onhold-bg)",     border: "var(--c-status-onhold-border)" },
  statusComplete:   { text: "var(--c-status-complete-text)",   bg: "var(--c-status-complete-bg)",   border: "var(--c-status-complete-border)" },

  // ── Text ─────────────────────────────────────────────────────────────────
  text:      "var(--c-text)",
  textSoft:  "var(--c-text-soft)",
  textMuted: "var(--c-text-muted)",
  textFaint: "var(--c-text-faint)",

  // Legacy aliases
  textSub:   "var(--c-text-soft)",
};

// Glass surfaces (Pip card, cadence event cards, etc.) — each property is a
// CSS var that the index.html palette overrides per theme. Same shape as the
// old `glass` object so consumers don't need to change.
export var glass = {
  background:           "var(--c-glass-bg)",
  backdropFilter:       "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border:               "1px solid var(--c-glass-border)",
  boxShadow:            "var(--c-glass-shadow)",
};

export function hexToRgb(hex) {
  if (!hex || hex[0] !== "#") return "0,0,0";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return r + "," + g + "," + b;
}
