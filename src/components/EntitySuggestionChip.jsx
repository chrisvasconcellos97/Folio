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

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      marginTop: 4, padding: "4px 0",
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
        {matchedAs} → {label}
      </span>
      {isAccount ? (
        <button
          onClick={onAcceptAssignee}
          style={{
            fontFamily: MONO, fontSize: 10, padding: "2px 8px",
            background: C.accentFaint, border: "1px solid " + C.accentLine,
            borderRadius: 999, color: C.accent, cursor: "pointer",
          }}
        >Route to dept</button>
      ) : (
        <>
          {(role === "assignee" || role === "ambiguous") && (
            <button
              onClick={onAcceptAssignee}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "2px 8px",
                background: C.accentFaint, border: "1px solid " + C.accentLine,
                borderRadius: 999, color: C.accent, cursor: "pointer",
              }}
            >Assignee</button>
          )}
          {(role === "recipient" || role === "ambiguous") && (
            <button
              onClick={onAcceptRecipient}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "2px 8px",
                background: C.surface2, border: "1px solid " + C.rule,
                borderRadius: 999, color: C.textMuted, cursor: "pointer",
              }}
            >Recipient</button>
          )}
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
