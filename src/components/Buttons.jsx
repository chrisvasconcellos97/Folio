import { C } from "../lib/colors";

var btnBase = {
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 600,
  fontSize: 12,
  borderRadius: 24,
  padding: "8px 16px",
  border: "none",
  transition: "opacity 0.15s",
};

export function AmberBtn({ onClick, children, style, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={Object.assign({}, btnBase, {
        background: disabled ? C.accentDim : C.accent,
        color: "#fff",
        opacity: disabled ? 0.5 : 1,
      }, style || {})}
    >
      {children}
    </button>
  );
}

export function SecBtn({ onClick, children, style, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={Object.assign({}, btnBase, {
        background: C.bgCardAlt,
        color: C.textSub,
        border: "1px solid " + C.border,
        opacity: disabled ? 0.5 : 1,
      }, style || {})}
    >
      {children}
    </button>
  );
}

export function DangerBtn({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={Object.assign({}, btnBase, {
        background: C.redFaint,
        color: C.red,
        border: "1px solid " + C.redLine,
      }, style || {})}
    >
      {children}
    </button>
  );
}

export { AmberBtn as AccentBtn };
