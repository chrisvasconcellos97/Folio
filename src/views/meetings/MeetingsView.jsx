import { useMemo } from "react";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { PipInsightCard } from "../../components/PipInsightCard";
import { PipLoader } from "../../components/PipLoader";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";
import { pickV } from "../../lib/metricsUtils";

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

function buildMeetingsInsight(meetings) {
  var seed  = "meetings" + new Date().getDate().toString();
  var today = new Date(); today.setHours(0, 0, 0, 0);

  if (meetings.length === 0) {
    return pickV(seed + "m0", [
      "No meetings logged yet. They'll show here once you start tracking them from any account.",
      "Empty log. Start tracking from any account page to build your history.",
    ]);
  }

  var todayMs   = today.getTime();
  var upcoming  = meetings.filter(function (m) { return m.meeting_date && new Date(m.meeting_date + "T00:00:00").getTime() >= todayMs; });
  var past      = meetings.filter(function (m) { return !m.meeting_date || new Date(m.meeting_date + "T00:00:00").getTime() < todayMs; });
  var todayCount = upcoming.filter(function (m) { return new Date(m.meeting_date + "T00:00:00").getTime() === todayMs; }).length;

  var sortedPast  = past.slice().sort(function (a, b) { return new Date(b.meeting_date) - new Date(a.meeting_date); });
  var lastMeeting = sortedPast.length > 0 ? sortedPast[0] : null;
  var daysSinceLast = lastMeeting
    ? Math.round((todayMs - new Date(lastMeeting.meeting_date + "T00:00:00").getTime()) / 86400000)
    : null;

  var uniqueAccounts = new Set(meetings.map(function (m) { return m.account_id; })).size;

  var parts = [];

  if (todayCount > 0) {
    parts.push(pickV(seed + "ml", [
      todayCount === 1 ? "One meeting today. Make it count." : todayCount + " meetings on the board today.",
      todayCount + " today. Be prepared.",
    ]));
  } else if (upcoming.length > 0) {
    parts.push(pickV(seed + "ml", [
      upcoming.length + " upcoming meeting" + (upcoming.length !== 1 ? "s" : "") + " logged.",
      upcoming.length + " in the pipeline. Good to have the calendar filled.",
    ]));
  } else {
    parts.push(pickV(seed + "ml", [
      past.length + " meetings logged across " + uniqueAccounts + " account" + (uniqueAccounts !== 1 ? "s" : "") + ".",
      "Meeting history spans " + uniqueAccounts + " account" + (uniqueAccounts !== 1 ? "s" : "") + ". " + past.length + " total.",
    ]));
  }

  if (daysSinceLast !== null && daysSinceLast > 14 && upcoming.length === 0) {
    parts.push(pickV(seed + "ms", [
      "Last one was " + daysSinceLast + " days ago with nothing upcoming. Time to fill the calendar.",
      daysSinceLast + " days since the last meeting and nothing ahead. Schedule something.",
    ]));
  } else if (upcoming.length > 0 && past.length > 0) {
    parts.push(pickV(seed + "ms", [
      past.length + " in the log, " + upcoming.length + " coming up.",
      "Good momentum — " + past.length + " logged, " + upcoming.length + " ahead.",
    ]));
  }

  return parts.join(" ");
}

export function MeetingsView({ meetings, loading }) {
  var meetingsInsight = useMemo(function () { return buildMeetingsInsight(meetings); }, [meetings]);
  var today      = new Date();
  var upcoming   = meetings.filter(function (m) { return m.meeting_date && new Date(m.meeting_date) >= today; });
  var past       = meetings.filter(function (m) { return !m.meeting_date || new Date(m.meeting_date) < today; });
  var pastGroups = groupByMonth(past);

  if (loading) {
    return (
      <div>
        <PipLoader />
      </div>
    );
  }

  return (
    <div>
      <PipInsightCard text={meetingsInsight} />
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
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
                      <div style={{ fontSize: 14, color: C.textSub, marginBottom: 6 }}>
                        {m.title || "Meeting"}
                      </div>
                      {daysOut <= 1 && (
                        <div
                          style={{
                            background: C.accentGlow,
                            border: "1px solid " + C.accentLine,
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                        {new Date(m.meeting_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
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
                fontWeight: 700,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
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
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                          {m.folio_accounts ? m.folio_accounts.name : "Account"}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSub }}>
                          {m.title || "Meeting"}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
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
                            lineHeight: 1.6,
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
          No meetings logged yet. Head to an account to record one.
        </div>
      )}
    </div>
  );
}
