import { C } from "../lib/colors";

var BASE = {
  width: "100%",
  background: C.bgDark,
  border: "1px solid " + C.border,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 16,
  color: C.text,
  outline: "none",
  transition: "border-color 0.15s",
  fontFamily: "'DM Sans', sans-serif",
};

export function InputField({ style, ...props }) {
  return (
    <input
      {...props}
      style={Object.assign({}, BASE, style)}
      onFocus={function (e) { e.target.style.borderColor = C.accent; }}
      onBlur={function (e) { e.target.style.borderColor = C.border; }}
    />
  );
}

export function TextArea({ style, ...props }) {
  return (
    <textarea
      {...props}
      style={Object.assign({}, BASE, { resize: "vertical", lineHeight: 1.5 }, style)}
      onFocus={function (e) { e.target.style.borderColor = C.accent; }}
      onBlur={function (e) { e.target.style.borderColor = C.border; }}
    />
  );
}

export function SelectField({ style, children, ...props }) {
  return (
    <select
      {...props}
      style={Object.assign({}, BASE, { cursor: "pointer", appearance: "none" }, style)}
      onFocus={function (e) { e.target.style.borderColor = C.accent; }}
      onBlur={function (e) { e.target.style.borderColor = C.border; }}
    >
      {children}
    </select>
  );
}
