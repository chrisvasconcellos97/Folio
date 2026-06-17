import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Morning check-in (Phase 1.2) — Pip asks before he declares. ≤3 one-tap
// verification questions whose answers immediately correct the data under
// the report (close the landed item, clear the moved hold). Receipts show
// inline so answering visibly pays. Disappears for the day once answered.
export function CheckInCard({ questions, receipts, onAnswer, isMobile }) {
  var allDone = questions.length === 0;
  if (allDone && (!receipts || receipts.length === 0)) return null;
  return (
    <div style={{
      maxWidth: 600,
      margin: isMobile ? "0 16px 12px" : "0 auto 12px",
      background: C.surface,
      border: "1px solid " + C.accentLine,
      borderLeft: "3px solid " + C.accent,
      borderRadius: 12,
      padding: "14px 16px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
      }}>
        <PipMark size={8} color={C.accent} glow pulse={!allDone} />
        <span style={{
          fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {allDone ? "Checked in ✓" : "Pip's check-in — before I read you the day"}
        </span>
      </div>

      <div role="status" aria-live="polite" aria-atomic="false">
        {(receipts || []).map(function (r, i) {
          return (
            <div key={"r" + i} style={{
              fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              marginBottom: 6, fontFamily: INTER,
            }}>
              ✓ {r}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {questions.map(function (q) {
          return (
            <div key={q.id}>
              <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 7, fontFamily: INTER }}>
                {q.text}
                {q.accountName && (
                  <span style={{ color: C.textMuted, fontSize: 12 }}> · {q.accountName}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {q.options.map(function (opt) {
                  var good = opt.tone === "good";
                  var warn = opt.tone === "warn";
                  return (
                    <button
                      key={opt.id}
                      onClick={function () { onAnswer(q, opt.id); }}
                      style={{
                        background: good ? C.accentFaint : warn ? C.yellowFaint : "transparent",
                        border: "1px solid " + (good ? C.accentLine : warn ? C.yellow : C.rule),
                        borderRadius: 8, padding: "6px 13px",
                        fontSize: 12, fontWeight: 600,
                        color: good ? C.accent : warn ? C.yellow : C.textSoft,
                        fontFamily: INTER, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
