// AccountNarrativeCard — surfaces Pip's re-derived 4-part account STORY (#17) on
// the account page. Reads the structured `narrative` object straight from
// folio_pip_account_state (no model call). Renders nothing until a story exists,
// so it's invisible on accounts Pip hasn't read yet (fail-soft).

import { C } from "../lib/colors";
import { PipOrb } from "./PipMark";
import { validateNarrative } from "../lib/accountNarrative";
import { fmtMedium } from "../lib/dateUtils";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function trajChip(t) {
  if (t === "warming") return { label: "Warming ↗", color: C.green };
  if (t === "cooling") return { label: "Cooling ↘", color: C.red };
  return { label: "Steady →", color: C.textMuted };
}

export function AccountNarrativeCard({ narrative }) {
  var n = validateNarrative(narrative);
  if (!n) return null;
  var chip = trajChip(n.trajectory);

  function Line({ label, text }) {
    if (!text) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, fontFamily: INTER, marginTop: 1 }}>{text}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.surface, border: "1px solid " + C.accentLine,
      borderRadius: 12, padding: "13px 15px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <PipOrb size="sm" isStatic />
        <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.09em" }}>
          The story
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700, color: chip.color,
          border: "1px solid " + chip.color, borderRadius: 4, padding: "1px 7px", letterSpacing: "0.05em",
        }}>{chip.label}</span>
        <span style={{ flex: 1 }} />
        {n.as_of && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textFaint }}>as of {fmtMedium(n.as_of)}</span>
        )}
      </div>

      {/* standing leads — it's where things stand right now */}
      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5, fontFamily: INTER, marginTop: 10, fontWeight: 500 }}>
        {n.standing}
      </div>
      <Line label="How it got here" text={n.arc} />
      <Line label="Hinges on" text={n.hinges_on} />
      {n.trajectory_why && (
        <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, fontFamily: INTER, marginTop: 8 }}>
          {chip.label.replace(/[↗↘→]/g, "").trim()} — {n.trajectory_why}
        </div>
      )}
    </div>
  );
}
