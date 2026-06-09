import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

// Work / Life switch. A compact two-segment pill — the active segment lights
// with the current accent (green in Work, dusty blue in Life), so the toggle
// itself previews the mode you'd flip to. Used bottom-left of the desktop rail
// (by the user menu) and in the mobile header.
//
// `compact` tightens it for the mobile header. `mode` is "work"|"life";
// `onToggle` flips it.
export function ModeToggle({ mode, onToggle, compact }) {
  var isLife = mode === "life";
  var pad = compact ? "4px 9px" : "5px 11px";
  var fs = compact ? 10 : 10.5;

  function seg(active) {
    return {
      fontFamily: MONO,
      fontSize: fs,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      padding: pad,
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      color: active ? C.bg : C.textMuted,
      background: active ? C.accent : "transparent",
      transition: "color 0.18s ease, background 0.18s ease",
      WebkitTapHighlightColor: "transparent",
      touchAction: "manipulation",
    };
  }

  return (
    <div
      role="group"
      aria-label="Work or Life mode"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        background: C.surface2,
        border: "1px solid " + C.rule,
      }}
    >
      <button
        type="button"
        aria-pressed={!isLife}
        onClick={function () { if (isLife) onToggle(); }}
        style={seg(!isLife)}
      >
        Work
      </button>
      <button
        type="button"
        aria-pressed={isLife}
        onClick={function () { if (!isLife) onToggle(); }}
        style={seg(isLife)}
      >
        Life
      </button>
    </div>
  );
}
