import { C } from "../lib/colors";

var baseStyle = {
  width: "100%",
  background: C.bgDark,
  border: "1px solid " + C.border,
  borderRadius: 10,
  padding: "10px 14px",
  color: C.text,
  fontSize: 16,
  fontFamily: "'Inter', system-ui, sans-serif",
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
};

export function InputField({ id, value, onChange, placeholder, type, style, onKeyDown, autoFocus }) {
  return (
    <input
      id={id}
      type={type || "text"}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      placeholder={placeholder}
      style={Object.assign({}, baseStyle, style || {})}
    />
  );
}

export function TextArea({ id, value, onChange, placeholder, rows, style, autoFocus }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows || 4}
      autoFocus={autoFocus}
      style={Object.assign({}, baseStyle, {
        resize: "vertical",
        lineHeight: 1.6,
      }, style || {})}
    />
  );
}

export function SelectField({ id, value, onChange, children, style }) {
  return (
    <select
      id={id}
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
