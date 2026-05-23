import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";

function groupByMonth(meetings) {
  var groups = {};
  meetings.forEach(function (m) {
    var key = m.meeting_date
      ? new Date(m.meeting_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  return groups;
}

export function MeetingsView({ meetings, loading }) {
  var today      = new Date();
  var upcoming   = meetings.filter(function (m) { return m.meeting_date && new Date(m.meeting_date) >= today; });
  var past       = meetings.filter(function (m) { return !m.meeting_date || new Date(m.meeting_date) < today; });
  var pastGroups = groupByMonth(past);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>
        Loading meetings...
      </div>
    );
  }

  return (
    <div>
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Upcoming
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(function (m) {
              var daysOut = Math.round(
                (new Date(m.meeting_date) - today) / (1000 * 60 * 60 * 24)
              );
              return (
                <Card
                  key={m.id}
                  style={{
                    borderLeft: "3px solid " + C.accent,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>
                        {m.folio_accounts ? m.folio_accounts.name : "Account"}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>
                        {m.title || "Meeting"}
                      </div>
                      {daysOut <= 1 && (
                        <div
                          style={{
                            background: C.accentGlow,
                            border: "1px solid rgba(74,155,130,0.2)",
                            borderRadius: 20,
                            padding: "3px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <PipMark size={7} color={C.accent} pulse />
                          <span style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>
                            {daysOut === 0 ? "Today" : "Tomorrow"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {new Date(m.meeting_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                        {new Date(m.meeting_date).getFullYear()}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Past by month */}
      {Object.keys(pastGroups).map(function (month) {
        return (
          <div key={month} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              {month}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pastGroups[month].map(function (m) {
                return (
                  <Card key={m.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: m.notes ? 8 : 0,
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                          {m.folio_accounts ? m.folio_accounts.name : "Account"}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSub }}>
                          {m.title || "Meeting"}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
                        {new Date(m.meeting_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                    {m.action_items && (
                      <div style={{ marginTop: 8 }}>
                        <FL>Actions</FL>
                        <div
                          style={{
                            fontSize: 11,
                            color: C.yellow,
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {m.action_items}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {meetings.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          No meetings yet. Log one from any account.
        </div>
      )}
    </div>
  );
}
