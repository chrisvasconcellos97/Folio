import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

// Compact red-tinted banner for read-path failures. Rendered above any
// list/tab where the underlying hook returned an error. Optional Retry
// button calls the hook's refetch.
export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        background: C.redFaint,
        border: "1px solid " + C.redLine,
        borderLeft: "3px solid " + C.red,
        borderRadius: 8,
        padding: "10px 13px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, letterSpacing: "0.04em" }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "transparent",
            border: "1px solid " + C.redLine,
            borderRadius: 6,
            padding: "4px 12px",
            color: C.red,
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
