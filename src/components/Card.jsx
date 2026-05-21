import { C } from "../lib/colors";

export function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={Object.assign(
        {
          background: C.bgCard,
          border: "1px solid " + C.border,
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
