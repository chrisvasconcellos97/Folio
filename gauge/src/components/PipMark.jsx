import { C } from "../lib/colors";

export function PipMark({ size = 12, color, pulse = false, glow = false, opacity = 1 }) {
  var c = color || C.accent;
  return (
    <svg
      width={size}
      height={size * 2}
      viewBox="0 0 10 20"
      fill="none"
      className={pulse ? "pip-pulse" : ""}
    >
      {glow && (
        <circle cx="5" cy="5" r="7" fill={c} fillOpacity="0.1" />
      )}
      <circle cx="5" cy="5" r="4" fill={c} fillOpacity={opacity} />
      {glow && (
        <circle cx="5" cy="15" r="5" fill={c} fillOpacity="0.07" />
      )}
      <circle cx="5" cy="15" r="2.8" fill={c} fillOpacity={opacity * 0.42} />
    </svg>
  );
}
