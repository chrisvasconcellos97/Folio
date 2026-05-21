import { C } from "../lib/colors";

export function FolioIcon({ size = 28, color }) {
  var s = size;
  var c = color || C.accent;
  return (
    <svg width={s} height={s * 0.87} viewBox="0 0 60 52" fill="none">
      <rect
        x="2" y="10" width="56" height="38" rx="4"
        fill={c} fillOpacity="0.12"
        stroke={c} strokeWidth="1.5" strokeOpacity="0.7"
      />
      <path d="M2 18 L58 18" stroke={c} strokeWidth="1" strokeOpacity="0.4" />
      <rect
        x="2" y="10" width="20" height="8" rx="2"
        fill={c} fillOpacity="0.25"
        stroke={c} strokeWidth="1" strokeOpacity="0.5"
      />
      <circle cx="30" cy="33" r="8" fill={c} fillOpacity="0.1" stroke={c} strokeWidth="1" strokeOpacity="0.4" />
      <circle cx="30" cy="30" r="3.5" fill={c} fillOpacity="0.85" />
      <circle cx="30" cy="37" r="2" fill={c} fillOpacity="0.4" />
    </svg>
  );
}
