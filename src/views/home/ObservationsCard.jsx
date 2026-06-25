import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { HexSignature } from "../../lib/hexMotif";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

var KIND_LABEL = {
  recurring:  "RECURRING",
  stall:      "STALLED",
  convergent: "PATTERN",
  capacity:   "CAPACITY",
};

// "✦ Pip connected some dots" — the Mastermind / Synthesis surface (item 52).
// QUARANTINED from the operational surfaces on purpose: the brief / waiting board
// stay grounded; the bolder strategic reframes live here, where a wrong take can't
// poison a surface Chris depends on daily. Renders nothing when there are no open
// observations (precision over volume — silence is the common, correct state).
export function ObservationsCard({ observations, onAct, onDismiss, isMobile }) {
  if (!observations || !observations.length) return null;

  return (
    <div style={{ maxWidth: 600, margin: isMobile ? "0 16px 12px" : "0 auto 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: isMobile ? "0 2px" : 0 }}>
        <PipMark size={9} color={C.accent} glow />
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.09em" }}>
          Pip connected some dots
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {observations.map(function (row) {
          var o = row.observation || {};
          var accts = Array.isArray(o.accounts) ? o.accounts.filter(Boolean) : [];
          var canAct = o.action_kind && o.action_kind !== "none" && o.action_label;
          return (
            <div key={row.id} style={{
              position: "relative", overflow: "hidden",
              background: C.bgCard, border: "1px solid " + C.accentLine,
              borderRadius: 12, padding: "13px 15px",
            }}>
              <HexSignature cells={5} peak={0.3} />
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                {o.kind && (
                  <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: C.accent, border: "1px solid " + C.accentLine, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.07em" }}>
                    {KIND_LABEL[o.kind] || "PIP"}
                  </span>
                )}
                {o.title && (
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: INTER }}>{o.title}</span>
                )}
              </div>

              {o.evidence && (
                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55, fontFamily: INTER, marginBottom: 6 }}>
                  {o.evidence}
                </div>
              )}

              {(o.why || o.expected) && (
                <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, fontFamily: INTER, marginBottom: 9 }}>
                  {o.why && <div><span style={{ color: C.textFaint }}>Why it matters — </span>{o.why}</div>}
                  {o.expected && <div style={{ marginTop: 2 }}><span style={{ color: C.textFaint }}>If you act — </span>{o.expected}</div>}
                </div>
              )}

              {accts.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
                  {accts.slice(0, 4).map(function (a, i) {
                    return (
                      <span key={i} style={{ fontSize: 10, color: C.textMuted, background: C.surface, border: "1px solid " + C.border, borderRadius: 5, padding: "1px 7px", fontFamily: INTER }}>
                        {a}
                      </span>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={function () { onDismiss(row.id); }}
                  style={{ background: "transparent", border: "1px solid " + C.border, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.textMuted, fontFamily: INTER, cursor: "pointer" }}
                >
                  Dismiss
                </button>
                {canAct ? (
                  <button
                    onClick={function () { onAct(row); }}
                    style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, fontFamily: INTER, cursor: "pointer" }}
                  >
                    {o.action_label}
                  </button>
                ) : (
                  <button
                    onClick={function () { onDismiss(row.id); }}
                    style={{ background: C.accentFaint, color: C.accent, border: "1px solid " + C.accentLine, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, fontFamily: INTER, cursor: "pointer" }}
                  >
                    Got it ✓
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
