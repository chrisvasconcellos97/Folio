import { C } from "../../../lib/colors";
import { AmberBtn, DangerBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";

export function ContactsTab({ contacts, onAdd, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {contacts.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          No contacts yet.
        </div>
      )}

      {contacts.map(function (c) {
        return (
          <Card key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: c.is_poc ? "rgba(200,136,58,0.2)" : "rgba(200,136,58,0.07)",
                border: "1px solid rgba(200,136,58,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
                color: C.accent,
                flexShrink: 0,
              }}
            >
              {c.name ? c.name.charAt(0).toUpperCase() : "?"}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.text,
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {c.name}
                {c.is_poc && (
                  <span
                    style={{
                      fontSize: 9,
                      color: C.yellow,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      background: "rgba(251,191,36,0.12)",
                      padding: "2px 6px",
                      borderRadius: 10,
                    }}
                  >
                    POC
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{c.title}</div>
              {c.notes && (
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 4, lineHeight: 1.5 }}>
                  {c.notes}
                </div>
              )}
            </div>

            {onDelete && (
              <DangerBtn
                onClick={function () { onDelete(c.id); }}
                style={{ fontSize: 10, padding: "4px 10px", flexShrink: 0 }}
              >
                Remove
              </DangerBtn>
            )}
          </Card>
        );
      })}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onAdd}>
        + Add Contact
      </AmberBtn>
    </div>
  );
}
