import { C } from "../lib/colors";
import { HexLattice } from "../lib/hexMotif";

var INTER = "'Inter', system-ui, sans-serif";

// Shared empty-state shell — one visual grammar for the 15+ bespoke "nothing
// here yet" blocks the app grew (App Coherence Rule). Centered stack: optional
// faint hex-lattice watermark (Pip's motif, item 45) → optional glyph/icon →
// title → subtitle → optional CTA. Colors are C tokens only, so both themes +
// Life-mode re-skin automatically (Theme Rule).
//
// Props:
//   title     — required headline (e.g. "No open commitments")
//   subtitle  — optional supporting line
//   icon      — optional node rendered above the title (emoji string or JSX)
//   cta       — optional node (a button) rendered below the subtitle
//   lattice   — show the hex watermark (default true); set false for terse
//               "no match" states where decoration would feel heavy
//   compact   — tighter padding for inline/in-card empties (default false)
export function EmptyState({ title, subtitle, icon, cta, lattice, compact }) {
  var showLattice = lattice !== false;
  return (
    <div style={{
      textAlign: "center",
      padding: compact ? "28px 16px" : "60px 20px",
      position: "relative",
    }}>
      {showLattice && <HexLattice opacity={0.045} />}
      {icon != null && (
        <div style={{ fontSize: 30, marginBottom: 14, lineHeight: 1 }}>{icon}</div>
      )}
      {title != null && (
        <div style={{
          fontFamily: INTER, fontSize: compact ? 15 : 18, fontWeight: 700,
          color: C.text, marginBottom: subtitle ? 8 : 0,
        }}>
          {title}
        </div>
      )}
      {subtitle != null && (
        <div style={{
          fontFamily: INTER, fontSize: compact ? 13 : 14, color: C.textMuted,
          lineHeight: 1.6, maxWidth: 300, margin: cta ? "0 auto 22px" : "0 auto",
        }}>
          {subtitle}
        </div>
      )}
      {cta != null && <div>{cta}</div>}
    </div>
  );
}
