import { useState, useMemo, useEffect } from "react";
import { C } from "../../../lib/colors";
import { PipMark } from "../../../components/PipMark";
import { AmberBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";
import { callAskPip } from "../../../lib/pip";
import {
  latestRecord, accountRecords,
  momPct, yoyPct, momDelta,
  fmtRevenue, fmtPct, fmtDelta,
  MONTH_NAMES, pickV,
} from "../../../lib/metricsUtils";

var RANGES = [
  { label: "30 Days",  days: 30 },
  { label: "90 Days",  days: 90 },
  { label: "All Time", days: null },
];

function buildPipInsight(account, openItems, revenueHistory, shopMetrics, projects) {
  var rh = revenueHistory || [];
  var sm = shopMetrics    || [];

  var openCount    = openItems.filter(function (i) { return !i.done; }).length;
  var today        = new Date().toISOString().split("T")[0];
  var overdueCount = openItems.filter(function (i) { return !i.done && i.due_date && i.due_date < today; }).length;

  var daysSince = null;
  if (account.last_interaction_at) {
    daysSince = Math.floor((Date.now() - new Date(account.last_interaction_at).getTime()) / 86400000);
  }

  var latestRev  = latestRecord(rh, account.id);
  var revMom     = latestRev ? momPct(rh, account.id, "revenue") : null;
  var latestShop = latestRecord(sm, account.id);
  var nocDelta   = latestShop ? momDelta(sm, account.id, "no_connection") : null;
  var intgDelta  = latestShop ? momDelta(sm, account.id, "integrated")    : null;

  var hasNextMeeting   = !!account.next_meeting;
  var nextMeetingLabel = account.next_meeting
    ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  var seed      = (account.id || account.name) + new Date().getDate().toString();
  var isGhosted = daysSince !== null && daysSince >= 60;
  var isStale   = daysSince !== null && daysSince >= 30 && daysSince < 60;
  var parts     = [];

  // Lead — most critical signal first
  if (account.status === "red" && isGhosted) {
    parts.push(pickV(seed + "a", [
      account.name + " is at risk and it's been " + daysSince + " days since your last touchpoint. That's a long silence.",
      account.name + " is flagged and you haven't touched base in " + daysSince + " days. This one needs a call.",
      "Red flag and " + daysSince + " days since contact on " + account.name + " — bump this to the top of the list.",
    ]));
  } else if (account.status === "red") {
    parts.push(pickV(seed + "a", [
      account.name + " needs attention." + (openCount > 0 ? " " + openCount + " open item" + (openCount !== 1 ? "s" : "") + " in the queue." : " The relationship needs a check-in."),
      account.name + " is flagged. I'd get ahead of this before it slips further.",
      "Something's off with " + account.name + ". Worth a proactive check-in before the next call.",
    ]));
  } else if (isGhosted) {
    parts.push(pickV(seed + "a", [
      "It's been " + daysSince + " days since you touched " + account.name + ". Might be worth a quick check-in.",
      account.name + " hasn't heard from you in " + daysSince + " days. A short email or call goes a long way.",
      "Quiet on the " + account.name + " front — " + daysSince + " days since last contact. Don't let this one go cold.",
    ]));
  } else if (isStale && account.status === "yellow") {
    parts.push(pickV(seed + "a", [
      account.name + " is in a watchful state and you haven't reached out in " + daysSince + " days. Keep the momentum going.",
      daysSince + " days since your last touchpoint with " + account.name + " — and they're still yellow. Stay on it.",
      account.name + " is watch-listed and going a bit quiet. A check-in now could shift the trajectory.",
    ]));
  } else if (account.status === "yellow") {
    parts.push(pickV(seed + "a", [
      account.name + " is moving in the right direction, but there's still work to do.",
      account.name + " is trending okay. Watch the open items — they'll tell you if this is slipping.",
      "Cautiously optimistic on " + account.name + ". Yellow means watch it, not forget it.",
    ]));
  } else if (account.status === "green" && daysSince !== null && daysSince <= 14) {
    parts.push(pickV(seed + "a", [
      account.name + " is in solid shape — and you were just there " + daysSince + " days ago. Good cadence.",
      account.name + " looks healthy. Recent contact, clean pipeline. Don't jinx it.",
      "Good momentum with " + account.name + ". Status is green and the relationship is active.",
    ]));
  } else {
    parts.push(pickV(seed + "a", [
      account.name + " is in good shape. Relationship looks solid from where I'm sitting.",
      account.name + " is healthy. Keep doing what you're doing.",
      "No red flags on " + account.name + ". Clean status, things are moving.",
    ]));
  }

  // Secondary — revenue signal if meaningful
  if (revMom !== null && revMom >= 10) {
    parts.push(pickV(seed + "b", [
      "Revenue is up " + revMom + "% month over month — strong.",
      "MoM revenue is up " + revMom + "%. That's a good number.",
    ]));
  } else if (revMom !== null && revMom <= -10) {
    parts.push(pickV(seed + "b", [
      "Revenue dropped " + Math.abs(revMom) + "% month over month — worth a closer look.",
      "MoM revenue is down " + Math.abs(revMom) + "%. Keep an eye on the trend.",
    ]));
  }

  // Tertiary — shop signals
  if (nocDelta !== null && nocDelta > 0) {
    parts.push(pickV(seed + "c", [
      "No-connection count is up " + nocDelta + " this month — flag it on your next call.",
      nocDelta + " more shops with no connection this month. That needs follow-up.",
    ]));
  } else if (intgDelta !== null && intgDelta > 0) {
    parts.push(pickV(seed + "c", [
      intgDelta + " more shops integrated this month — nice progress.",
      "Integration count is up " + intgDelta + ". That's a win.",
    ]));
  }

  // Closing — overdue, next meeting, or nudge
  if (overdueCount > 0) {
    parts.push(pickV(seed + "d", [
      overdueCount + " item" + (overdueCount !== 1 ? "s are" : " is") + " overdue — clear those before your next call.",
      "You've got " + overdueCount + " overdue item" + (overdueCount !== 1 ? "s" : "") + " here. Get those cleared.",
    ]));
  } else if (hasNextMeeting) {
    parts.push(pickV(seed + "d", [
      "Next meeting is on " + nextMeetingLabel + " — you're good.",
      "Scheduled for " + nextMeetingLabel + ". Stay prepared.",
    ]));
  } else if (account.status !== "red") {
    parts.push(pickV(seed + "d", [
      "No meeting on the calendar — worth booking something.",
      "Nothing scheduled yet. A quick check-in could keep this one warm.",
    ]));
  }

  // Projects signal
  var prjs = projects || [];
  var blocked = prjs.filter(function(p) { return p.status === "blocked"; });
  var active  = prjs.filter(function(p) { return p.status === "in_progress"; });
  if (blocked.length > 0 && parts.length < 3) {
    parts.push(pickV(seed + "gp", [
      blocked.length + " Gauge project" + (blocked.length !== 1 ? "s are" : " is") + " blocked — flag it on your next call.",
      blocked.length + " project" + (blocked.length !== 1 ? "s" : "") + " blocked in Gauge. Worth addressing.",
    ]));
  } else if (active.length > 0 && parts.length < 3) {
    parts.push(pickV(seed + "gp", [
      active.length + " project" + (active.length !== 1 ? "s" : "") + " in flight in Gauge.",
      "Tracking " + active.length + " active Gauge project" + (active.length !== 1 ? "s" : "") + " for this account.",
    ]));
  }

  return parts.join(" ");
}

function pctColor(pct) {
  if (pct === null || pct === undefined) return C.textMuted;
  return pct >= 0 ? C.green : C.red;
}

function MiniSparkline({ records }) {
  if (!records || records.length === 0) return null;
  var last12  = records.slice(-12);
  var maxRev  = Math.max.apply(null, last12.map(function (r) { return r.revenue; }));
  if (maxRev === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18, marginTop: 8 }}>
      {last12.map(function (r, i) {
        var h      = Math.max(2, Math.round((r.revenue / maxRev) * 18));
        var isLast = i === last12.length - 1;
        return (
          <div
            key={i}
            title={MONTH_NAMES[r.month - 1] + " " + r.year + ": " + fmtRevenue(r.revenue)}
            style={{
              flex: 1, height: h,
              background: isLast ? C.accent : C.accentDim,
              borderRadius: 1,
              opacity: isLast ? 0.9 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

export function OverviewTab({ account, openItems, meetings, onQuickMeeting, onLogMeeting, onAddItem, onSaveSummary, subAccounts, onSelectAccount, revenueHistory, shopMetrics, onUpdateAccount, projects }) {
  var pipInsight = useMemo(function () {
    return buildPipInsight(account, openItems, revenueHistory, shopMetrics, projects);
  }, [account, openItems, revenueHistory, shopMetrics, projects]);
  var [range, setRange]       = useState(RANGES[0]);
  var [generating, setGen]    = useState(false);
  var [pipError, setPipError] = useState(null);
  var [notesDraft, setNotesDraft] = useState(account.objective || "");

  useEffect(function () { setNotesDraft(account.objective || ""); }, [account.id]);

  var openCount = openItems.filter(function (i) { return !i.done; }).length;

  var lastMeeting = meetings && meetings.length > 0 ? meetings[0] : null;
  var followUp = lastMeeting && lastMeeting.follow_up_date ? lastMeeting.follow_up_date : null;
  var today = new Date().toISOString().slice(0, 10);
  var followUpOverdue = followUp && followUp < today;

  var healthScore = (function () {
    var flags = [];

    // Days since last interaction
    if (account.last_interaction_at) {
      var days = Math.floor((Date.now() - new Date(account.last_interaction_at)) / 86400000);
      if (days > 60) flags.push("red");
      else if (days > 30) flags.push("yellow");
    } else {
      flags.push("yellow");
    }

    // Overdue open items
    var overdueItems = openItems.filter(function (i) {
      return !i.done && i.due_date && i.due_date < today;
    });
    if (overdueItems.length > 3) flags.push("red");
    else if (overdueItems.length > 0) flags.push("yellow");

    // Follow-up overdue
    if (followUpOverdue) flags.push("yellow");

    if (flags.indexOf("red") !== -1) return "red";
    if (flags.indexOf("yellow") !== -1) return "yellow";
    return "green";
  })();

  var cutoffDate = range.days
    ? new Date(Date.now() - range.days * 86400000).toISOString().split("T")[0]
    : null;
  var filteredMeetings = cutoffDate
    ? meetings.filter(function (m) { return m.meeting_date && m.meeting_date >= cutoffDate; })
    : meetings;

  function handleSummarize() {
    if (filteredMeetings.length === 0 || generating) return;
    setGen(true);
    setPipError(null);
    callAskPip({
      mode: "account",
      accountName: account.name,
      meetings: filteredMeetings,
      rangeLabel: range.label,
    }).then(function (data) {
      setGen(false);
      if (data.summary && onSaveSummary) onSaveSummary(data.summary);
    }).catch(function () {
      setGen(false);
      setPipError("Pip is unavailable right now.");
    });
  }

  var summaryDateLabel = account.pip_account_summary_at
    ? "Updated " + new Date(account.pip_account_summary_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  var btnLabel = generating
    ? "Pip is thinking..."
    : filteredMeetings.length === 0
      ? "No meetings in range"
      : (account.pip_account_summary ? "Regenerate" : "Summarize") +
        " (" + filteredMeetings.length + " meeting" + (filteredMeetings.length !== 1 ? "s" : "") + ")";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pip status card */}
      <div
        style={{
          background: C.accentGlow,
          border: "1px solid " + C.accentLine,
          borderRadius: 12,
          padding: "13px 15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <PipMark size={8} color={C.accent} glow pulse />
          <div
            style={{
              fontSize: 10,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Pip
          </div>
        </div>
        <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65 }}>
          {pipInsight}
        </div>
      </div>

      {/* Pip — Relationship Summary */}
      <div
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 12,
          padding: "13px 15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <PipMark size={7} color={C.accent} glow />
          <div
            style={{
              fontSize: 10,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              flex: 1,
            }}
          >
            Relationship Summary
          </div>
          {summaryDateLabel && (
            <div style={{ fontSize: 10, color: C.textMuted }}>{summaryDateLabel}</div>
          )}
        </div>

        {/* Range selector */}
        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {RANGES.map(function (r) {
            var active = range.label === r.label;
            return (
              <button
                key={r.label}
                onClick={function () { setRange(r); }}
                style={{
                  background: active ? C.bgPillActive : C.bgPill,
                  color: active ? C.accent : C.textMuted,
                  border: "1px solid " + (active ? C.accentSubtle : C.border),
                  borderRadius: 20,
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {account.pip_account_summary && (
          <div
            style={{
              fontSize: 12,
              color: C.textSub,
              lineHeight: 1.7,
              marginBottom: 10,
              whiteSpace: "pre-wrap",
            }}
          >
            {account.pip_account_summary}
          </div>
        )}

        {pipError && (
          <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>{pipError}</div>
        )}

        <AmberBtn
          onClick={handleSummarize}
          style={{
            width: "100%",
            fontSize: 12,
            opacity: generating || filteredMeetings.length === 0 ? 0.5 : 1,
            cursor: generating || filteredMeetings.length === 0 ? "not-allowed" : "pointer",
          }}
          disabled={generating || filteredMeetings.length === 0}
        >
          {btnLabel}
        </AmberBtn>
      </div>

      {/* Notes — always visible, editable scratchpad */}
      <Card>
        <FL>Notes</FL>
        <textarea
          value={notesDraft}
          onChange={function (e) { setNotesDraft(e.target.value); }}
          onBlur={function () {
            if (onUpdateAccount && notesDraft !== (account.objective || "")) {
              onUpdateAccount({ objective: notesDraft });
            }
          }}
          placeholder="Quick thoughts, reminders, anything that doesn't belong to a specific meeting…"
          style={{
            width: "100%", background: "transparent", border: "none", resize: "none",
            color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.6, outline: "none", minHeight: 72, padding: 0,
          }}
        />
      </Card>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card>
          <FL>Last Meeting</FL>
          <div style={{ fontSize: 14, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {account.last_meeting
              ? new Date(account.last_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—"}
          </div>
        </Card>
        <Card>
          <FL>Next Meeting</FL>
          <div style={{ fontSize: 14, color: account.next_meeting ? C.accent : C.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {account.next_meeting
              ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not scheduled"}
          </div>
        </Card>
        {followUp && (
          <Card>
            <FL>Follow-up Due</FL>
            <div style={{ fontSize: 14, color: followUpOverdue ? C.red : C.accent, fontVariantNumeric: "tabular-nums" }}>
              {new Date(followUp + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {followUpOverdue && <span style={{ fontSize: 10, color: C.red, marginLeft: 6, fontWeight: 700 }}>OVERDUE</span>}
            </div>
          </Card>
        )}
        <Card>
          <FL>Open Items</FL>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: openCount > 0 ? C.yellow : C.green,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {openCount}
          </div>
        </Card>
        <Card>
          <FL>Health</FL>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: healthScore === "green" ? C.green : healthScore === "yellow" ? C.yellow : C.red }} />
            <span style={{ fontSize: 14, color: healthScore === "green" ? C.green : healthScore === "yellow" ? C.yellow : C.red, fontWeight: 500, textTransform: "capitalize" }}>
              {healthScore === "green" ? "Healthy" : healthScore === "yellow" ? "Watch" : "At Risk"}
            </span>
          </div>
        </Card>
        <Card>
          <FL>Revenue YTD</FL>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
            {account.revenue || "—"}
          </div>
        </Card>
      </div>

      {/* Revenue trend */}
      {(function () {
        var rh      = revenueHistory || [];
        var sm      = shopMetrics || [];
        var latest  = latestRecord(rh, account.id);
        var records = accountRecords(rh, account.id);
        var mom     = momPct(rh, account.id, "revenue");
        var yoy     = yoyPct(rh, account.id, "revenue");
        var latestShop = latestRecord(sm, account.id);
        var smMomConn = latestShop ? momDelta(sm, account.id, "connected")     : null;
        var smMomIntg = latestShop ? momDelta(sm, account.id, "integrated")    : null;
        var smMomNoc  = latestShop ? momDelta(sm, account.id, "no_connection") : null;
        var monthLabel = latest ? MONTH_NAMES[latest.month - 1] + " " + latest.year : "";
        var shopLabel  = latestShop ? MONTH_NAMES[latestShop.month - 1] + " " + latestShop.year : "";
        var total      = latestShop ? latestShop.connected + latestShop.integrated + latestShop.no_connection : 0;

        return (
          <>
            {latest && (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                  <FL>Revenue Trend</FL>
                  <div style={{ fontSize: 10, color: C.textMuted }}>{monthLabel}</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                    {fmtRevenue(latest.revenue)}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {mom !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(mom), fontVariantNumeric: "tabular-nums" }}>{fmtPct(mom)} MoM</span>
                    )}
                    {yoy !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(yoy), fontVariantNumeric: "tabular-nums" }}>{fmtPct(yoy)} YoY</span>
                    )}
                  </div>
                </div>
                <MiniSparkline records={records} />
              </Card>
            )}

            {latestShop && (
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <FL>Shop Connections</FL>
                  <div style={{ fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{total} total · {shopLabel}</div>
                </div>
                {[
                  { label: "Connected",     key: "connected",     color: C.yellow, delta: smMomConn },
                  { label: "Integrated",    key: "integrated",    color: C.green,  delta: smMomIntg },
                  { label: "No Connection", key: "no_connection", color: C.red,    delta: smMomNoc  },
                ].map(function (row) {
                  var val = latestShop[row.key];
                  var pct = total > 0 ? Math.round((val / total) * 100) : 0;
                  return (
                    <div key={row.key} style={{ marginBottom: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: row.color, opacity: 0.8 }} />
                          <span style={{ fontSize: 12, color: C.textSub }}>{row.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {row.delta !== null && row.delta !== undefined && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: row.key === "no_connection" ? pctColor(-row.delta) : pctColor(row.delta), fontVariantNumeric: "tabular-nums" }}>
                              {fmtDelta(row.delta)} MoM
                            </span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", minWidth: 24, textAlign: "right" }}>{val}</span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: C.bgDark, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: row.color, borderRadius: 2, opacity: 0.6 }} />
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        );
      })()}

      {/* Recent Deliveries */}
      {(function() {
        var deliveries = (openItems || [])
          .filter(function(i) { return i.done && i.text && i.text.indexOf("✓ Delivered:") === 0; })
          .sort(function(a, b) { return (b.closed_at || "") > (a.closed_at || "") ? 1 : -1; })
          .slice(0, 5);
        if (deliveries.length === 0) return null;
        return (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <FL>Recent Deliveries</FL>
              <div style={{ fontSize: 10, color: C.textMuted }}>{deliveries.length} completed</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {deliveries.map(function(item) {
                var title = item.text.replace("✓ Delivered: ", "");
                var dateStr = item.closed_at
                  ? new Date(item.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : null;
                return (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 11, color: C.green }}>✓</span>
                      <span style={{ fontSize: 12, color: C.textSub }}>{title}</span>
                    </div>
                    {dateStr && (
                      <span style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{dateStr}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <AmberBtn style={{ flex: 1 }} onClick={onQuickMeeting}>
          Quick Meeting
        </AmberBtn>
        <SecBtn style={{ flex: 1 }} onClick={onAddItem}>
          Add Item
        </SecBtn>
      </div>
      <div style={{ textAlign: "center" }}>
        <button
          onClick={onLogMeeting}
          style={{
            background: "none",
            border: "none",
            color: C.textMuted,
            fontSize: 11,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          Full meeting log →
        </button>
      </div>

      {/* Sub-accounts */}
      {subAccounts && subAccounts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Sub-accounts ({subAccounts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subAccounts.map(function (sub) {
              var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
              var TIER_COLORS = { Major: C.blue, Mid: C.purple, Growth: C.green };
              return (
                <div
                  key={sub.id}
                  onClick={function () { onSelectAccount && onSelectAccount(sub); }}
                  style={{
                    background: C.bgCard, border: '1px solid ' + C.border,
                    borderRadius: 10, padding: '11px 14px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{sub.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      {sub.tier && (
                        <span style={{ fontSize: 10, color: TIER_COLORS[sub.tier] || C.textMuted }}>{sub.tier}</span>
                      )}
                      {sub.status && (
                        <span style={{ fontSize: 10, color: STATUS_COLORS[sub.status] || C.textMuted }}>
                          {{ green: 'Healthy', yellow: 'Watch', red: 'At Risk' }[sub.status] || sub.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted }}>→</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
