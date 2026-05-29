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

export function InputField({ id, value, onChange, placeholder, type, style, onKeyDown, autoFocus, onFocus, onBlur, ariaLabel }) {
  return (
    <input
      id={id}
      type={type || "text"}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={ariaLabel || (id ? undefined : placeholder)}
      style={Object.assign({}, baseStyle, style || {})}
    />
  );
}

export function TextArea({ id, value, onChange, onKeyDown, onFocus, onPaste, placeholder, rows, style, autoFocus, ariaLabel }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPaste={onPaste}
      placeholder={placeholder}
      rows={rows || 4}
      autoFocus={autoFocus}
      aria-label={ariaLabel || (id ? undefined : placeholder)}
      style={Object.assign({}, baseStyle, {
        resize: "vertical",
        lineHeight: 1.6,
      }, style || {})}
    />
  );
}

export function SelectField({ id, value, onChange, children, style, ariaLabel }) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      style={Object.assign({}, baseStyle, {
        appearance: "none",
        cursor: "pointer",
      }, style || {})}
    >
      {children}
    </select>
  );
}
