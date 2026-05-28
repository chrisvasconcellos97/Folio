import { PipOrb } from "./PipMark";
import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

// Either pass `text` (plain string) or `segments` (array of strings + JSX nodes
// like <Glow onClick={...}>2 cadences</Glow>). Segments take precedence.
export function PipInsightCard({ text, segments }) {
  var body = segments && segments.length > 0 ? segments : text;
  if (!body) return null;
  return (
    <div style={{
      // Theme-aware: dark uses a teal-tinted dark surface, light uses
      // the spec's paper Pip-card surface + halo shadow (var resolves both).
      background: "var(--c-pip-card-bg)",
      border: "1px solid " + C.accentBorder,
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 4,
      boxShadow: "var(--c-pip-card-shadow)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
        <PipOrb size="md" />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Pip Noticed
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textSoft, lineHeight: 1.5 }}>{body}</div>
        </div>
      </div>
    </div>
  );
}
