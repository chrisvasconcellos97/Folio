export function Pill({ color, children, style, onClick }) {
  // `color` is a CSS-var token (e.g. "var(--c-yellow)"), so the old hexToRgb()
  // path returned "0,0,0" and every pill rendered a black tint. color-mix tints
  // directly off the token and re-themes correctly in light/dark.
  var c = color || "var(--c-text-muted)";
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={Object.assign(
        {
          background: "color-mix(in srgb, " + c + " 15%, transparent)",
          color: c,
          fontSize: 10,
          fontWeight: 600,
          padding: "3px 9px",
          borderRadius: 20,
          border: "1px solid color-mix(in srgb, " + c + " 24%, transparent)",
          whiteSpace: "nowrap",
          cursor: onClick ? "pointer" : "default",
        },
        style || {}
      )}
    >
      {children}
    </span>
  );
}
