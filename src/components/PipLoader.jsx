import { PipMark } from "./PipMark";
import { C } from "../lib/colors";

export function PipLoader({ label, height }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: height || 220, gap: 18,
    }}>
      <div className="pip-sonar" style={{
        width: 52, height: 52, borderRadius: "50%",
        background: C.accentGlow,
        border: "1px solid " + C.accentBorder,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 20px " + C.accentShadow,
      }}>
        <PipMark size={14} color={C.accent} glow pulse />
      </div>
      {label && (
        <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.03em" }}>
          {label}
        </div>
      )}
    </div>
  );
}
