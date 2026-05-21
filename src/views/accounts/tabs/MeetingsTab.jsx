import { C } from "../../../lib/colors";
import { AmberBtn, DangerBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";

var STARS = [1, 2, 3, 4, 5];

export function MeetingsTab({ meetings, onLogMeeting, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {meetings.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          No meetings logged yet.
        </div>
      )}

      {meetings.map(function (m) {
        return (
          <Card key={m.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 10,
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>
                  {m.title || "Meeting"}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  {m.meeting_date
                    ? new Date(m.meeting_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : ""}
                </div>
              </div>
              {m.rating && (
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  {STARS.map(function (s) {
                    return (
                      <span
                        key={s}
                        style={{ fontSize: 12, color: s <= m.rating ? C.yellow : C.textMuted }}
                      >
                        ★
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {m.notes && (
              <div style={{ marginBottom: 10 }}>
                <FL>Notes</FL>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {m.notes}
                </div>
              </div>
            )}

            {m.talking_points && (
              <div style={{ marginBottom: 10 }}>
                <FL>Talking Points</FL>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {m.talking_points}
                </div>
              </div>
            )}

            {m.action_items && (
              <div style={{ marginBottom: 10 }}>
                <FL>Action Items</FL>
                <div style={{ fontSize: 12, color: C.yellow, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {m.action_items}
                </div>
              </div>
            )}

            {m.commitments && (
              <div style={{ marginBottom: 10 }}>
                <FL>Commitments</FL>
                <div style={{ fontSize: 12, color: C.blue, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {m.commitments}
                </div>
              </div>
            )}

            {m.follow_up_date && (
              <div style={{ marginBottom: 10 }}>
                <FL>Follow-up</FL>
                <div style={{ fontSize: 12, color: C.accent }}>
                  {new Date(m.follow_up_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            )}

            {onDelete && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <DangerBtn
                  onClick={function () { onDelete(m.id); }}
                  style={{ fontSize: 11, padding: "5px 12px" }}
                >
                  Delete
                </DangerBtn>
              </div>
            )}
          </Card>
        );
      })}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onLogMeeting}>
        + Log New Meeting
      </AmberBtn>
    </div>
  );
}
