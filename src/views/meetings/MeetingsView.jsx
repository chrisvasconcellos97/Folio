import { useMemo, useState } from "react";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { PipInsightCard } from "../../components/PipInsightCard";
import { PipLoader } from "../../components/PipLoader";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";
import { Modal } from "../../components/Modal";
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

function formatDetailDate(dateStr) {
  if (!dateStr) return "";
  var d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function MeetingDetailModal({ meeting, onClose }) {
  var [copied, setCopied] = useState(false);
  var m = meeting;
  var accountName = m.folio_accounts ? m.folio_accounts.name : "Account";
  var dateLabel = formatDetailDate(m.meeting_date);

  function handleCopy() {
    var parts = [
      accountName + " — " + (m.title || "Meeting") + " — " + dateLabel,
    ];
    if (m.notes) parts.push("Notes: " + m.notes);
    if (m.action_items) parts.push("Action Items: " + m.action_items);
    var text = parts.join("\n");
    navigator.clipboard.writeText(text).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2000);
    });
  }

  var mailtoBody = encodeURIComponent(m.pip_email || "");
  var mailtoHref = "mailto:?body=" + mailtoBody;

  return (
    <Modal title="" onClose={onClose} width={560}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'Fraunces Variable', Georgia, serif",
          fontSize: 18,
          fontWeight: 700,
          color: C.text,
          marginBottom: 4,
        }}>
          {accountName}
        </div>
        <div style={{
          fontFamily: "'Inter Variable', system-ui, sans-serif",
          fontSize: 14,
          color: C.textSoft,
          marginBottom: 6,
        }}>
          {m.title || "Meeting"}
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono Variable', monospace",
          fontSize: 12,
          color: C.textMuted,
          fontVariantNumeric: "tabular-nums",
        }}>
          {dateLabel}
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {m.notes && (
          <div>
            <FL>Notes</FL>
            <div style={{
              fontFamily: "'Inter Variable', system-ui, sans-serif",
              fontSize: 14,
              color: C.text,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {m.notes}
            </div>
          </div>
        )}

        {m.action_items && (
          <div>
            <FL>Action Items</FL>
            <div style={{
              fontFamily: "'Inter Variable', system-ui, sans-serif",
              fontSize: 14,
              color: C.yellow,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {m.action_items}
            </div>
          </div>
        )}

        {m.attendees && m.attendees.length > 0 && (
          <div>
            <FL>Attendees</FL>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              {m.attendees.map(function (a, i) {
                return (
                  <span key={i} style={{
                    background: C.surface2,
                    border: "1px solid " + C.rule,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontFamily: "'Inter Variable', system-ui, sans-serif",
                    fontSize: 12,
                    color: C.textSoft,
                  }}>
                    {a}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {m.pip_summary && (
          <div>
            <FL>
              <span style={{ color: C.accent, marginRight: 4 }}>✦ Pip</span>
              Pip Summary
            </FL>
            <div style={{
              fontFamily: "'Inter Variable', system-ui, sans-serif",
              fontSize: 14,
              color: C.textSoft,
              lineHeight: 1.6,
              fontStyle: "italic",
              whiteSpace: "pre-wrap",
            }}>
              {m.pip_summary}
            </div>
          </div>
        )}

        {m.pip_email && (
          <div>
            <FL>Draft Email</FL>
            <div style={{
              fontFamily: "'Inter Variable', system-ui, sans-serif",
              fontSize: 13,
              color: C.textSoft,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              marginBottom: 8,
            }}>
              {m.pip_email}
            </div>
            <a
              href={mailtoHref}
              style={{
                display: "inline-block",
                fontFamily: "'Inter Variable', system-ui, sans-serif",
                fontSize: 12,
                color: C.accent,
                textDecoration: "none",
                border: "1px solid " + C.accentBorder,
                borderRadius: 6,
                padding: "5px 12px",
              }}
            >
              Open in Mail
            </a>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid " + C.rule,
        display: "flex",
        justifyContent: "flex-end",
      }}>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? C.accentFaint : C.surface2,
            border: "1px solid " + (copied ? C.accentBorder : C.rule),
            borderRadius: 8,
            padding: "8px 16px",
            fontFamily: "'Inter Variable', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: copied ? C.accent : C.textSoft,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {copied ? "✓ Copied" : "Copy Summary"}
        </button>
      </div>
    </Modal>
  );
}

export function MeetingsView({ meetings, loading }) {
  var [selectedMeeting, setSelectedMeeting] = useState(null);
  var [hoveredId, setHoveredId] = useState(null);

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
              var isHovered = hoveredId === m.id;
              return (
                <div
                  key={m.id}
                  onMouseEnter={function () { setHoveredId(m.id); }}
                  onMouseLeave={function () { setHoveredId(null); }}
                >
                <Card
                  style={{
                    borderLeft: "3px solid " + C.accent,
                    cursor: "pointer",
                    position: "relative",
                    background: isHovered ? C.accentFaint : undefined,
                    transition: "background 0.12s",
                  }}
                  onClick={function () { setSelectedMeeting(m); }}
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
                </div>
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
                var isHovered = hoveredId === m.id;
                return (
                  <Card
                    key={m.id}
                    style={{
                      cursor: "pointer",
                      background: isHovered ? C.accentFaint : undefined,
                      transition: "background 0.12s",
                    }}
                    onClick={function () { setSelectedMeeting(m); }}
                    onMouseEnter={function () { setHoveredId(m.id); }}
                    onMouseLeave={function () { setHoveredId(null); }}
                  >
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

      {selectedMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          onClose={function () { setSelectedMeeting(null); }}
        />
      )}
    </div>
  );
}
