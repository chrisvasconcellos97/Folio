// Canonical Pip orb — uses CSS classes from index.html for sizing and sonar.
// size: "xs"|"sm"|"md"|"lg"|"xl"|"xxl" (default "lg")
// sonar: bool — adds expanding rings
// isStatic: bool — disables animation
// extra className and style props passed through

export function PipOrb({ size = "lg", sonar = false, isStatic = false, className = "", style, onClick }) {
  var cls = ["pip", size, sonar ? "sonar" : "", isStatic ? "static" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} onClick={onClick} role={onClick ? "button" : undefined}>
      <svg viewBox="-10 -10 20 20" aria-hidden="true">
        <circle className="head" cx="0" cy="-4" r="4" />
        <circle className="tail" cx="0" cy="4.5" r="2.8" />
      </svg>
    </div>
  );
}

// PipMark kept as backward-compat alias so existing imports don't break
export function PipMark({ size = 12, color, pulse = false, glow = false, opacity = 1 }) {
  // Map old numeric size to new CSS size classes
  var sizeClass = size <= 8 ? "xs" : size <= 16 ? "sm" : size <= 24 ? "md" : "lg";
  return <PipOrb size={sizeClass} sonar={false} />;
}
