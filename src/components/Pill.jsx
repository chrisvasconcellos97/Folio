import { hexToRgb } from "../lib/colors";

export function Pill({ color, children, style }) {
  var rgb = hexToRgb(color);
  return (
    <span
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
        },
        style || {}
      )}
    >
      {children}
    </span>
  );
}
