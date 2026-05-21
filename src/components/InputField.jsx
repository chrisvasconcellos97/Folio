import { C } from "../lib/colors";

var baseStyle = {
  width: "100%",
  background: C.bgDark,
  border: "1px solid " + C.border,
  borderRadius: 10,
  padding: "10px 14px",
  color: C.text,
  fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

export function InputField({ value, onChange, placeholder, type, style }) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={Object.assign({}, baseStyle, style || {})}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows, style }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows || 4}
      style={Object.assign({}, baseStyle, {
        resize: "vertical",
        lineHeight: 1.6,
      }, style || {})}
    />
  );
}

export function SelectField({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={Object.assign({}, baseStyle, {
        appearance: "none",
        cursor: "pointer",
      }, style || {})}
    >
      {children}
    </select>
  );
}
