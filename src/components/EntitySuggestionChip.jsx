import { C } from "../lib/colors.js";

var MONO = "var(--font-mono, 'JetBrains Mono', monospace)";

export function EntitySuggestionChip({ suggestion, onAcceptAssignee, onAcceptRecipient, onDismiss }) {
  if (!suggestion) return null;

  var isAccount = suggestion.type === "account";
  var label = isAccount
    ? suggestion.account.name
    : (suggestion.contact.name + (suggestion.contact.title ? " · " + suggestion.contact.title : ""));
  var matchedAs = suggestion.matchedAs;
  var role = suggestion.role;

  var btnBase = {
    fontFamily: MONO, fontSize: 10, padding: "2px 8px",
    borderRadius: 999, cursor: "pointer",
  };
  var accentStyle = Object.assign({}, btnBase, {
    background: C.accentFaint, border: "1px solid " + C.accentLine, color: C.accent,
  });
  var mutedStyle = Object.assign({}, btnBase, {
    background: C.surface2, border: "1px solid " + C.rule, color: C.textMuted,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      marginTop: 4, padding: "4px 0",
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
        {matchedAs} → {label}
      </span>
      {isAccount ? (
        <button onClick={onAcceptAssignee} style={accentStyle}>Route to dept</button>
      ) : (
        // Always offer both interpretations — assignee (does the work) and
        // recipient (it's for them). The role the detector inferred is shown
        // in accent; the other stays muted but is still one click away.
        <>
          <button
            onClick={onAcceptAssignee}
            style={role === "recipient" ? mutedStyle : accentStyle}
          >Assignee</button>
          <button
            onClick={onAcceptRecipient}
            style={role === "assignee" ? mutedStyle : accentStyle}
          >Recipient</button>
        </>
      )}
      <button
        onClick={onDismiss}
        style={{
          fontFamily: MONO, fontSize: 10, padding: "2px 6px",
          background: "none", border: "none",
          color: C.textFaint, cursor: "pointer",
        }}
      >Ignore</button>
    </div>
  );
}
