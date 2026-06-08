// Canonical Pip orb — uses CSS classes from index.html for sizing and sonar.
// size: "xs"|"sm"|"md"|"lg"|"xl"|"xxl" (default "lg")
// sonar: bool — adds expanding rings
// isStatic: bool — disables animation (kept literal — no state class applied)
// state: optional override; otherwise reads from PipStateProvider context
//        ("idle" | "thinking" | "speaking" | "alert")
// extra className and style props passed through

import { usePipState } from "../lib/pipState";

export function PipOrb({ size = "lg", sonar = false, heartbeat = false, isStatic = false, state, className = "", style, onClick }) {
  var ctx = usePipState();
  var liveState = isStatic ? "idle" : (state || ctx.state || "idle");
  var stateCls = liveState && liveState !== "idle" ? liveState : "";
  var cls = ["pip", size, sonar ? "sonar" : "", heartbeat ? "heartbeat" : "", isStatic ? "static" : "", stateCls, className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} onClick={onClick} role={onClick ? "button" : undefined}>
      <svg viewBox="-10 -10 20 20" aria-hidden="true">
        <circle className="head" cx="0" cy="-4" r="4" />
        <circle className="tail" cx="0" cy="4.5" r="2.8" />
      </svg>
    </div>
  );
}

// PipMark kept as backward-compat alias so existing imports don't break.
// Forwards color/pulse/glow/opacity to PipOrb so callers like
// MeetingReminderBanner (urgency-tinted, pulsing orb) actually render that
// state instead of a default idle orb.
export function PipMark({ size = 12, color, pulse = false, glow = false, opacity = 1 }) {
  // Map old numeric size to new CSS size classes
  var sizeClass = size <= 8 ? "xs" : size <= 16 ? "sm" : size <= 24 ? "md" : "lg";
  var style = { opacity: opacity };
  if (color) style.color = color; // orb circles inherit currentColor
  if (glow)  style.filter = "drop-shadow(0 0 4px " + (color || "var(--c-accent)") + ")";
  return <PipOrb size={sizeClass} sonar={false} state={pulse ? "alert" : undefined} style={style} />;
}
