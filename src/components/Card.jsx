import { C, glass } from "../lib/colors";

export function Card({ children, style, onClick, className }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={Object.assign(
        {},
        glass,
        {
          borderRadius: 12,
          padding: "13px 15px",
          cursor: onClick ? "pointer" : "default",
        },
        style || {}
      )}
    >
      {children}
    </div>
  );
}
