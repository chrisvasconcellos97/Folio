import { C } from "../lib/colors";
import { HexSignature } from "../lib/hexMotif";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// One neutral content-card grammar for Home (and anywhere a labeled,
// left-accented info card is wanted). Home had grown several near-identical
// shells — a local Panel, OperatorHub section cards, "Your word", "Scheduled
// Today" — that drifted in padding, header treatment, and hex usage. InfoCard
// is the single anatomy for USER-content cards (App Coherence Rule).
//
// Pip-AUTHORED cards stay PipCard (5-cell hex signature, ✦ Pip identity) —
// InfoCard carries item 45's 3-cell @0.13 user-content signature instead, so
// the two card families read distinctly. Colors are C tokens (Theme Rule).
//
// Props:
//   label    — small uppercase mono header (e.g. "Today's Calls", "✦ Your word")
//   accent   — header text + left-edge color (default C.accent)
//   count    — optional pill count badge on the right of the header strip
//   sig      — show the 3-cell hex corner signature (default true)
//   children — card body
//   style    — extra outer style overrides (e.g. margin)
export function InfoCard({ label, accent, count, sig, children, style }) {
  var ac = accent || C.accent;
  var showSig = sig !== false;
  return (
    <div style={Object.assign({
      position: "relative",
      background: C.surface,
      border: "1px solid " + C.rule,
      borderLeft: "2px solid " + ac,
      borderRadius: 12,
      padding: "14px 16px 16px",
      overflow: "hidden",
    }, style || {})}>
      {label != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, color: ac, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            {label}
          </span>
          {count != null && (
            <span style={{
              marginLeft: "auto",
              fontFamily: MONO, fontSize: 10, fontWeight: 700, color: ac,
              minWidth: 18, textAlign: "center",
              border: "1px solid " + ac, borderRadius: 999, padding: "1px 7px",
            }}>
              {count}
            </span>
          )}
        </div>
      )}
      <div style={{ fontFamily: INTER, fontSize: 14, color: C.textSoft, lineHeight: 1.6 }}>
        {children}
      </div>
      {showSig && (
        <div style={{ position: "absolute", right: 7, bottom: 5, opacity: 0.9, pointerEvents: "none" }}>
          <HexSignature cells={3} peak={0.13} />
        </div>
      )}
    </div>
  );
}
