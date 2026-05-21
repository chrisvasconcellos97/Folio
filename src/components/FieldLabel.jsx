import { C } from "../lib/colors";

export function FL({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: C.textMuted,
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </div>
  );
}
