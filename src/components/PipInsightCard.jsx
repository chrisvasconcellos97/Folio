import { PipMark } from "./PipMark";
import { C } from "../lib/colors";

export function PipInsightCard({ text }) {
  if (!text) return null;
  return (
    <div style={{
      background: C.accentGlow,
      border: "1px solid rgba(74,155,130,0.2)",
      borderRadius: 12,
      padding: "13px 15px",
      marginBottom: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <PipMark size={8} color={C.accent} glow pulse />
        <div style={{ fontSize: 9, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Pip
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>{text}</div>
    </div>
  );
}
