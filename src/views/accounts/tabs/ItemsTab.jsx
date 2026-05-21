import { C } from "../../../lib/colors";
import { AmberBtn } from "../../../components/Buttons";

export function ItemsTab({ items, onClose, onAdd }) {
  var open   = items.filter(function (i) { return !i.done; });
  var closed = items.filter(function (i) { return i.done; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Open items */}
      {open.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Open
          </div>
          {open.map(function (item) {
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: C.bgCard,
                  border: "1px solid " + C.border,
                  borderRadius: 10,
                  padding: "11px 13px",
                  marginBottom: 6,
                }}
              >
                <div style={{ paddingTop: 2 }}>
                  <div
                    onClick={function () { onClose(item.id); }}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: "1.5px solid " + C.accentDim,
                      cursor: "pointer",
                      flexShrink: 0,
                      background: "transparent",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>
                    {item.text}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    {item.due_date && (
                      <div style={{ fontSize: 10, color: C.yellow }}>
                        {"Due: " + new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {item.owner && (
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {"Owner: " + item.owner}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "24px 0 8px",
            color: C.green,
            fontSize: 13,
          }}
        >
          All clear. No open items.
        </div>
      )}

      {/* Closed items */}
      {closed.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Closed
          </div>
          {closed.map(function (item) {
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: C.bgCard,
                  border: "1px solid " + C.border,
                  borderRadius: 10,
                  padding: "11px 13px",
                  marginBottom: 6,
                  opacity: 0.5,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: "1.5px solid " + C.accentDim,
                    background: C.accentDim,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#fff" }}>✓</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.textMuted,
                      textDecoration: "line-through",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.text}
                  </div>
                  {item.closed_at && (
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                      {"Closed: " + new Date(item.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onAdd}>
        + Add Open Item
      </AmberBtn>
    </div>
  );
}
