import { useMemo, useState } from "react";
import { C } from "../../lib/colors";
import { fmtShort, fmtMedium } from "../../lib/dateUtils";
import { EmptyState } from "../../components/EmptyState";
import { PipMark } from "../../components/PipMark";
import { PipInsightCard } from "../../components/PipInsightCard";
import { PipLoader } from "../../components/PipLoader";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";
import { Modal } from "../../components/Modal";
import { AddToTasksButton } from "../../components/AddToTasksButton";
import { Glow } from "../../components/Glow";
import { Mark } from "../../components/Mark";
import { pickV } from "../../lib/metricsUtils";

var MV_MONO  = "'JetBrains Mono', ui-monospace, monospace";
var MV_SERIF = "'Fraunces', Georgia, serif";

function groupByMonth(meetings) {
  var groups = {};
  meetings.forEach(function (m) {
    // T00:00:00 so a date-only value parses in LOCAL time (bare new
    // Date("YYYY-MM-DD") is UTC midnight → groups into the prior month in ET after ~8pm).
    var key = m.meeting_date
      // eslint-ok: one-off locale format (month + year group key)
      ? new Date(m.meeting_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  return groups;
}

function buildMeetingsInsight(allMeetings, handlers, activeAccountIds) {
  var seed  = "meetings" + new Date().getDate().toString();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var h     = handlers || {};
  // Drop meetings on archived accounts so the "5 upcoming" count isn't
  // padded with conversations on dead accounts.
  var meetings = activeAccountIds
    ? (allMeetings || []).filter(function (m) { return !m.account_id || activeAccountIds[m.account_id]; })
    : (allMeetings || []);

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

  // Hot phrases — meetings today and upcoming meetings glow.
  var todayGlow    = <Glow onClick={h.onClickToday}>{todayCount + " meeting" + (todayCount !== 1 ? "s" : "") + " today"}</Glow>;
  var upcomingGlow = <Glow onClick={h.onClickUpcoming}>{upcoming.length + " upcoming meeting" + (upcoming.length !== 1 ? "s" : "")}</Glow>;

  var lead;
  if (todayCount > 0) {
    lead = pickV(seed + "ml", [
      <>{todayGlow}. Make them count.</>,
      <>{todayGlow}. Be prepared.</>,
    ]);
  } else if (upcoming.length > 0) {
    lead = pickV(seed + "ml", [
      <>{upcomingGlow} logged.</>,
      <>{upcomingGlow} in the pipeline. Good to have the calendar filled.</>,
    ]);
  } else {
    lead = pickV(seed + "ml", [
      <>{past.length} meetings logged across {uniqueAccounts} account{uniqueAccounts !== 1 ? "s" : ""}.</>,
      <>Meeting history spans {uniqueAccounts} account{uniqueAccounts !== 1 ? "s" : ""}. {past.length} total.</>,
    ]);
  }

  var tail = null;
  if (daysSinceLast !== null && daysSinceLast > 14 && upcoming.length === 0) {
    tail = pickV(seed + "ms", [
      <>Last one was {daysSinceLast} days ago with nothing upcoming. Time to fill the calendar.</>,
      <>{daysSinceLast} days since the last meeting and nothing ahead. Schedule something.</>,
    ]);
  } else if (upcoming.length > 0 && past.length > 0) {
    tail = pickV(seed + "ms", [
      <>{past.length} in the log, {upcoming.length} coming up.</>,
      <>Good momentum — {past.length} logged, {upcoming.length} ahead.</>,
    ]);
  }

  return <>{lead}{tail ? <> {tail}</> : null}</>;
}

function formatDetailDate(dateStr) {
  if (!dateStr) return "";
  return fmtMedium(dateStr);
}

function MeetingDetailModal({ meeting, onClose, allItems, addItem }) {
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <FL style={{ marginBottom: 0 }}>Tasks</FL>
              {addItem && m.account_id && (
                <AddToTasksButton
                  actionItemsText={m.action_items}
                  accountId={m.account_id}
                  openItems={(allItems || []).filter(function (i) { return i.account_id === m.account_id && !i.done; })}
                  addItem={addItem}
                />
              )}
            </div>
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

export function MeetingsView({ meetings, loading, allItems, addItem, accounts }) {
  var [selectedMeeting, setSelectedMeeting] = useState(null);
  var [hoveredId, setHoveredId] = useState(null);

  var activeAccountIds = (function () {
    if (!accounts) return null;
    var ids = {};
    accounts.forEach(function (a) { if (!a.is_inactive) ids[a.id] = true; });
    return ids;
  })();

  var meetingsInsight = buildMeetingsInsight(meetings, {
    onClickToday:    function () { var el = document.querySelector('[data-meetings-section="upcoming"]'); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); },
    onClickUpcoming: function () { var el = document.querySelector('[data-meetings-section="upcoming"]'); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); },
  }, activeAccountIds);
  var today      = new Date(); today.setHours(0, 0, 0, 0); // local midnight → today's meetings count as upcoming
  var upcoming   = meetings.filter(function (m) { return m.meeting_date && new Date(m.meeting_date + "T00:00:00") >= today; });
  var past       = meetings.filter(function (m) { return !m.meeting_date || new Date(m.meeting_date + "T00:00:00") < today; });
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
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <Mark tab="meetings" size={52} />
        <div>
          <div style={{ fontFamily: MV_SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Meetings
          </div>
          <div style={{ fontFamily: MV_MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            Conversation History · {meetings.length} Total
          </div>
        </div>
      </div>

      <PipInsightCard segments={[meetingsInsight]} />

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div data-meetings-section="upcoming" style={{ marginBottom: 24 }}>
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
                (new Date(m.meeting_date + "T00:00:00") - today) / (1000 * 60 * 60 * 24)
              );
              var isHovered = hoveredId === m.id;
              return (
                <div
                  key={m.id}
                  className="hover-lift"
                  onMouseEnter={function () { setHoveredId(m.id); }}
                  onMouseLeave={function () { setHoveredId(null); }}
                >
                <Card
                  style={{
                    borderLeft: "3px solid " + C.accent,
                    boxShadow: "-2px 0 8px -3px " + C.accent,
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
                      <div style={{ fontFamily: MV_SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, marginBottom: 3, letterSpacing: "-0.005em", lineHeight: 1.2 }}>
                        {m.folio_accounts ? m.folio_accounts.name : "Account"}
                      </div>
                      <div style={{ fontFamily: MV_MONO, fontSize: 10, color: C.textSub, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
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
                        {fmtShort(m.meeting_date)}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {new Date(m.meeting_date + "T00:00:00").getFullYear()}
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
                    className="hover-lift"
                    style={{
                      cursor: "pointer",
                      borderLeft: "3px solid " + C.accent,
                      boxShadow: "-2px 0 8px -3px " + C.accent,
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
                        <div style={{ fontFamily: MV_SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, marginBottom: 3, letterSpacing: "-0.005em", lineHeight: 1.2 }}>
                          {m.folio_accounts ? m.folio_accounts.name : "Account"}
                        </div>
                        <div style={{ fontFamily: MV_MONO, fontSize: 10, color: C.textSub, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {m.title || "Meeting"}
                        </div>
                      </div>
                      <div style={{ fontFamily: MV_MONO, fontSize: 10, color: C.textMuted, flexShrink: 0, letterSpacing: "0.04em", fontFeatureSettings: '"tnum"' }}>
                        {fmtShort(m.meeting_date)}
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
        <EmptyState
          title="No meetings logged yet."
          subtitle="Head to an account to record one — every meeting you log gives Pip more to work with."
        />
      )}

      {selectedMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          onClose={function () { setSelectedMeeting(null); }}
          allItems={allItems}
          addItem={addItem}
        />
      )}
    </div>
  );
}
