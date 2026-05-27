import { hexToRgb } from "../lib/colors";

export function Pill({ color, children, style, onClick }) {
  var rgb = hexToRgb(color);
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={Object.assign(
        {
          background: "rgba(" + rgb + ",0.15)",
          color: color,
          fontSize: 10,
          fontWeight: 600,
          padding: "3px 9px",
          borderRadius: 20,
          border: "1px solid rgba(" + rgb + ",0.2)",
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
