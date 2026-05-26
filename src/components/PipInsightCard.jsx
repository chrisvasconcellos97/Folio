import { PipOrb } from "./PipMark";
import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

export function PipInsightCard({ text }) {
  if (!text) return null;
  return (
    <div style={{
      background: "oklch(0.18 0.025 178 / 0.5)",
      border: "1px solid " + C.accentBorder,
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 4,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
        <PipOrb size="md" />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Pip Noticed
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textSoft, lineHeight: 1.5 }}>{text}</div>
        </div>
      </div>
    </div>
  );
}
