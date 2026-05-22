import { C } from "../lib/colors";

export function FL({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}
