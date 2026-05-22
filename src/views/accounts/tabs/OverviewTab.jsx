import { useState } from "react";
import { C } from "../../../lib/colors";
import { PipMark } from "../../../components/PipMark";
import { AmberBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";
import { callAskPip } from "../../../lib/pip";

var RANGES = [
  { label: "30 Days",  days: 30 },
  { label: "90 Days",  days: 90 },
  { label: "All Time", days: null },
];

function pipStatusLine(account, openCount) {
  if (account.status === "red") {
    return (
      account.name +
      " needs attention. " +
      openCount +
      " open item" +
      (openCount !== 1 ? "s" : "") +
      " — the oldest may be overdue. I'd prioritize this one before your next call."
    );
  }
  if (account.status === "yellow") {
    return (
      account.name +
      " is moving in the right direction, but watch the open items. " +
      openCount +
      " still pending."
    );
  }
  return (
    account.name + " is in great shape. Relationship is healthy and the pipeline looks solid."
  );
}

export function OverviewTab({ account, openItems, meetings, onQuickMeeting, onLogMeeting, onAddItem, onSaveSummary, subAccounts, onSelectAccount }) {
  var [range, setRange]       = useState(RANGES[0]);
  var [generating, setGen]    = useState(false);
  var [pipError, setPipError] = useState(null);

  var openCount = openItems.filter(function (i) { return !i.done; }).length;

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
          border: "1px solid rgba(200,136,58,0.2)",
          borderRadius: 12,
          padding: "13px 15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <PipMark size={8} color={C.accent} glow pulse />
          <div
            style={{
              fontSize: 9,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Pip
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>
          {pipStatusLine(account, openCount)}
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
              fontSize: 9,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              flex: 1,
            }}
          >
            Relationship Summary
          </div>
          {summaryDateLabel && (
            <div style={{ fontSize: 9, color: C.textMuted }}>{summaryDateLabel}</div>
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
                  border: "1px solid " + (active ? "rgba(200,136,58,0.3)" : C.border),
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

      {/* Notes */}
      {account.objective && (
        <Card>
          <FL>Notes</FL>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            {account.objective}
          </div>
        </Card>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card>
          <FL>Last Meeting</FL>
          <div style={{ fontSize: 13, color: C.text }}>
            {account.last_meeting
              ? new Date(account.last_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—"}
          </div>
        </Card>
        <Card>
          <FL>Next Meeting</FL>
          <div style={{ fontSize: 13, color: account.next_meeting ? C.accent : C.textMuted }}>
            {account.next_meeting
              ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not scheduled"}
          </div>
        </Card>
        <Card>
          <FL>Open Items</FL>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: openCount > 0 ? C.yellow : C.green,
            }}
          >
            {openCount}
          </div>
        </Card>
        <Card>
          <FL>Revenue YTD</FL>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>
            {account.revenue || "—"}
          </div>
        </Card>
      </div>

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
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
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
