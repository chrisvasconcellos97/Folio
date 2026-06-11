import { createPortal } from "react-dom";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { HexPulse } from "../../lib/hexMotif";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Item 39 — two-phase summarize. Shown the moment "End & Summarize" is hit:
// Pip's prose recap streams in live, then the caller swaps this overlay for
// the full PipSummarizePreview once the structured plan has parsed.
//
// Self-contained portal (NOT the shared Modal): it must stack ABOVE the
// full-screen CadenceMeetingMode portal (zIndex 9999), which stays open
// underneath until the summarize resolves. Deliberately button-less — it's a
// transient reading surface; every action waits for the real plan modal.
export function SummarizeStreamingOverlay({ summary }) {
  var hasText = Boolean(summary && summary.trim());
  var node = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "var(--c-overlay-shadow, rgba(0,0,0,0.5))",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 620, maxHeight: "80vh", overflowY: "auto",
        background: C.surface2, border: "1px solid " + C.rule,
        borderRadius: 14, padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 14,
        boxSizing: "border-box",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.accentGlow, border: "1px solid " + C.accentLine, borderRadius: 8,
        }}>
          <PipMark size={8} color={C.accent} glow pulse />
          <HexPulse style={{ marginLeft: 4 }} />
          <div style={{ fontSize: 12, color: C.textSub, fontFamily: INTER }}>
            {hasText ? "Recap first — the structured plan follows in a moment." : "Reading your notes…"}
          </div>
        </div>
        {hasText && (
          <div style={{
            fontSize: 14, color: C.text, lineHeight: 1.65, fontFamily: INTER,
            whiteSpace: "pre-wrap",
            background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 10, padding: "14px 16px",
          }}>
            {summary}
            <span style={{ color: C.accent }}>▍</span>
          </div>
        )}
        <div style={{
          fontFamily: MONO, fontSize: 10, color: C.textMuted,
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          ✦ Structuring the plan…
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
