import { useState, useEffect } from "react";
import { C } from "../../../lib/colors";
import { PipMark } from "../../../components/PipMark";
import { AmberBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";
import { callAskPip } from "../../../lib/pip";
import { useAccountNotes } from "../../../hooks/useAccountNotes";
import { supabase } from "../../../lib/supabase";
import { buildPipInsight } from "../../../lib/accountInsights.jsx";
import { UPDATE_TYPE_LABELS, UPDATE_TYPE_COLORS } from "../../../lib/accountUpdateTypes";

var RANGES = [
  { label: "30 Days",  days: 30 },
  { label: "90 Days",  days: 90 },
  { label: "All Time", days: null },
];

export function OverviewTab({ account, userId, orgId, openItems, meetings, onQuickMeeting, onLogMeeting, onAddItem, onSaveSummary, subAccounts, onSelectAccount, onUpdateAccount, projects, updates, onSwitchTab }) {
  var isPartner = account.account_type === "partner";
  var pipInsight = buildPipInsight(account, openItems, projects, {
    onClickOverdue: function () { onSwitchTab && onSwitchTab("tasks"); },
    onClickBlocked: function () { onSwitchTab && onSwitchTab("projects"); },
  });
  var [range, setRange]       = useState(RANGES[0]);
  var [generating, setGen]    = useState(false);
  var [pipError, setPipError] = useState(null);

  var { notes: savedNotes, saveNotes } = useAccountNotes(userId, account.id, orgId, account.objective, onUpdateAccount);
  var [notesDraft, setNotesDraft] = useState(savedNotes || account.objective || "");
  var [externalStages, setExternalStages] = useState([]);

  useEffect(function () { setNotesDraft(savedNotes || account.objective || ""); }, [account.id, savedNotes]);

  // Fetch external stages from gauge_projects for this account
  useEffect(function () {
    if (!account || !account.id) return;
    supabase
      .from("gauge_projects")
      .select("id, title, stages, account_id, account_ids")
      .or("account_id.eq." + account.id + ",account_ids.cs.{" + account.id + "}")
      .then(function (result) {
        if (result.error || !result.data) return;
        var rows = [];
        result.data.forEach(function (proj) {
          var stages = proj.stages || [];
          stages.forEach(function (s) {
            if (s.is_external && !s.completed_at) {
              rows.push({
                stageTitle:    s.title,
                projectTitle:  proj.title,
                contactName:   s.external_contact_name || null,
                projectId:     proj.id,
              });
            }
          });
        });
        setExternalStages(rows);
      });
  }, [account.id]);

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
                  fontFamily: "'Inter', system-ui, sans-serif",
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

      {/* Account context — Pip reads this on every summarize / brief call */}
      <Card>
        <FL>Account context (Pip reads this)</FL>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
          Write anything Pip should know about this account — history, key people, terminology, deal context.
        </div>
        <textarea
          value={notesDraft}
          onChange={function (e) { setNotesDraft(e.target.value); }}
          onBlur={function () {
            saveNotes(notesDraft);
          }}
          placeholder="Quick thoughts, reminders, anything that doesn't belong to a specific meeting…"
          style={{
            width: "100%", background: "transparent", border: "none", resize: "none",
            color: C.text, fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif",
            lineHeight: 1.6, outline: "none", minHeight: 72, padding: 0,
          }}
        />
      </Card>

      {/* Recent updates — last 5, links into the full Updates tab. */}
      {(function () {
        var recent = (updates || []).slice(0, 5);
        if (recent.length === 0) {
          return (
            <Card onClick={onSwitchTab ? function () { onSwitchTab("updates"); } : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <FL>Recent Updates</FL>
                <span style={{ fontSize: 10, color: C.textMuted }}>0 logged</span>
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
                No account updates logged yet.
              </div>
              <SecBtn onClick={onSwitchTab ? function () { onSwitchTab("updates"); } : undefined} style={{ fontSize: 11 }}>
                + Log update
              </SecBtn>
            </Card>
          );
        }
        return (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <FL>Recent Updates</FL>
              <button
                onClick={onSwitchTab ? function () { onSwitchTab("updates"); } : undefined}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, color: C.textMuted, fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                View all →
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {recent.map(function (u) {
                var color = UPDATE_TYPE_COLORS[u.update_type] || C.textMuted;
                var label = UPDATE_TYPE_LABELS[u.update_type] || u.update_type;
                return (
                  <div
                    key={u.id}
                    onClick={onSwitchTab ? function () { onSwitchTab("updates"); } : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: onSwitchTab ? "pointer" : "default",
                    }}
                  >
                    <span style={{
                      fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums",
                      minWidth: 52, flexShrink: 0,
                    }}>
                      {u.update_date
                        ? new Date(u.update_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "—"}
                    </span>
                    <span style={{ fontSize: 12, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.title}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 9, color: color, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "1px 6px", borderRadius: 10, border: "1px solid " + color,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card onClick={account.last_meeting && onSwitchTab ? function () { onSwitchTab("meetings"); } : undefined}>
          <FL>Last Meeting</FL>
          <div style={{ fontSize: 14, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {account.last_meeting
              ? new Date(account.last_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—"}
          </div>
        </Card>
        <Card onClick={account.next_meeting && onSwitchTab ? function () { onSwitchTab("meetings"); } : undefined}>
          <FL>Next Meeting</FL>
          <div style={{ fontSize: 14, color: account.next_meeting ? C.accent : C.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {account.next_meeting
              ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not scheduled"}
          </div>
        </Card>
        {followUp && (
          <Card onClick={onSwitchTab ? function () { onSwitchTab("meetings"); } : undefined}>
            <FL>Follow-up Due</FL>
            <div style={{ fontSize: 14, color: followUpOverdue ? C.red : C.accent, fontVariantNumeric: "tabular-nums" }}>
              {new Date(followUp + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {followUpOverdue && <span style={{ fontSize: 10, color: C.red, marginLeft: 6, fontWeight: 700 }}>OVERDUE</span>}
            </div>
          </Card>
        )}
        <Card onClick={onSwitchTab ? function () { onSwitchTab("tasks"); } : undefined}>
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
        {isPartner && (
          <Card>
            <FL>Spend YTD</FL>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
              {account.spend_ytd != null ? "$" + Number(account.spend_ytd).toLocaleString() : "—"}
            </div>
          </Card>
        )}
      </div>

      {/* Partner Agreement card */}
      {isPartner && (account.agreement_end_date || account.scope_summary || account.billing_terms) && (
        <Card>
          <FL>Partner Agreement</FL>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {account.scope_summary && (
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>Scope</div>
                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{account.scope_summary}</div>
              </div>
            )}
            {(account.agreement_end_date || account.billing_terms) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {account.agreement_end_date && (
                  <div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>Agreement End</div>
                    <div style={{ fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                      {new Date(account.agreement_end_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                )}
                {account.billing_terms && (
                  <div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>Billing</div>
                    <div style={{ fontSize: 13, color: C.text }}>{account.billing_terms}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

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
          Quick Conversation
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
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          Full conversation log →
        </button>
      </div>

      {/* Waiting on Client — external Gauge stages */}
      {externalStages.length > 0 && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <FL>Waiting on Client</FL>
            <div style={{ fontSize: 10, color: C.yellow }}>{externalStages.length} pending</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {externalStages.map(function (row, i) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.yellow, flexShrink: 0, marginTop: 1 }}>↗</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{row.stageTitle}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {row.projectTitle}
                      {row.contactName ? " · " + row.contactName : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
