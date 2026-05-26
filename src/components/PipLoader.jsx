import { PipOrb } from "./PipMark";
import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

export function PipLoader({ label, height }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: height || 220, gap: 18,
    }}>
      <PipOrb size="lg" sonar />
      {label && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {label}
        </div>
      )}
    </div>
  );
}
