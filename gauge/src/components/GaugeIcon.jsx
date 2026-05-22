import { C } from "../lib/colors";

export function GaugeIcon({ size = 40, color, glow }) {
  var c   = color || C.accent;
  var s   = size;
  var uid = "gi" + s + (glow ? "g" : "n");

  return (
    <svg width={s} height={s} viewBox="0 0 60 60" fill="none">
      <defs>
        <filter id={uid} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glow ? "2.5" : "0"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={"url(#" + uid + ")"}>
        {/* Outer arc: 135° → 45° clockwise through top (270° sweep) */}
        <path
          d="M 14.44 52.56 A 22 22 0 1 1 45.56 52.56"
          stroke={c}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />

        {/* Inner arc (decorative) */}
        <path
          d="M 19.39 47.61 A 15 15 0 1 1 40.61 47.61"
          stroke={c}
          strokeWidth="1"
          strokeLinecap="round"
          strokeOpacity="0.3"
        />

        {/* Tick at 9 o'clock */}
        <line x1="8" y1="37" x2="11" y2="37" stroke={c} strokeWidth="1.5" strokeOpacity="0.55" />
        {/* Tick at 12 o'clock */}
        <line x1="30" y1="15" x2="30" y2="18" stroke={c} strokeWidth="1.5" strokeOpacity="0.55" />
        {/* Tick at 3 o'clock */}
        <line x1="52" y1="37" x2="49" y2="37" stroke={c} strokeWidth="1.5" strokeOpacity="0.55" />

        {/* Needle pointing at 12 o'clock */}
        <line
          x1="30" y1="37"
          x2="30" y2="20"
          stroke={c}
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.95"
        />

        {/* Center pivot */}
        <circle cx="30" cy="37" r="3.5" fill={c} fillOpacity="0.9" />

        {/* Bright dot at needle tip */}
        <circle cx="30" cy="20" r="2" fill={c} fillOpacity="0.75" />
      </g>
    </svg>
  );
}
