import { C } from "../lib/colors";

export function Card({ children, style, onClick, className }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={Object.assign(
        {
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 12,
          padding: "13px 15px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
          cursor: onClick ? "pointer" : "default",
        },
        style || {}
      )}
    >
      {children}
    </div>
  );
}
