import { useState } from "react";
import { C } from "../../../lib/colors";
import { fmtMedium } from "../../../lib/dateUtils";
import { EmptyState } from "../../../components/EmptyState";

var MT_SERIF = "'Fraunces', Georgia, serif";
var MT_MONO  = "'JetBrains Mono', ui-monospace, monospace";
import { AmberBtn, DangerBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";
import { MarkdownText } from "../../../components/MarkdownText";
import { PipMark } from "../../../components/PipMark";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { AddToTasksButton } from "../../../components/AddToTasksButton";
import { callAskPip } from "../../../lib/pip";
import { isDefaultMeetingTitle } from "../../../lib/meetingTitle";
import { pickV } from "../../../lib/metricsUtils";
import { showToast } from "../../../components/Toast";
import { EditMeetingModal } from "../EditMeetingModal";
import { supabase } from "../../../lib/supabase";

var STARS = [1, 2, 3, 4, 5];

function buildMeetingsInsight(meetings, accountName) {
  var seed  = accountName + new Date().getDate().toString();
  var today = new Date().toISOString().split("T")[0];

  if (meetings.length === 0) {
    return pickV(seed + "m0", [
      "No meetings logged yet. Add the first one and I'll have a lot more to work with.",
      "Nothing tracked here yet. Once you log a meeting, this tab gets a lot more useful.",
    ]);
  }

  var sorted = meetings.slice().sort(function (a, b) {
    return b.meeting_date > a.meeting_date ? 1 : -1;
  });
  var last = sorted[0];
  var daysSinceLast = last.meeting_date
    ? Math.floor((Date.now() - new Date(last.meeting_date + "T00:00:00").getTime()) / 86400000)
    : null;

  var parts = [];

  // Lead — last meeting recency
  if (daysSinceLast === null) {
    parts.push(meetings.length + " meeting" + (meetings.length !== 1 ? "s" : "") + " logged for " + accountName + ".");
  } else if (daysSinceLast < 7) {
    parts.push(pickV(seed + "ml", [
      "Just came out of a meeting with " + accountName + " — " + daysSinceLast + " day" + (daysSinceLast !== 1 ? "s" : "") + " ago. Fresh.",
      "Last meeting was " + daysSinceLast + " day" + (daysSinceLast !== 1 ? "s" : "") + " ago. Good cadence here.",
    ]));
  } else if (daysSinceLast < 30) {
    parts.push(pickV(seed + "ml", [
      "Last meeting was " + daysSinceLast + " days ago. " + meetings.length + " logged in total — solid rhythm.",
      meetings.length + " meeting" + (meetings.length !== 1 ? "s" : "") + " on record. Last one was " + daysSinceLast + " days back.",
    ]));
  } else if (daysSinceLast < 90) {
    parts.push(pickV(seed + "ml", [
      "It's been " + daysSinceLast + " days since the last logged meeting. Cadence is slowing down here.",
      "Last meeting was " + daysSinceLast + " days ago — getting a bit quiet.",
    ]));
  } else {
    parts.push(pickV(seed + "ml", [
      "Over " + Math.floor(daysSinceLast / 30) + " months since the last logged meeting. That's a long gap.",
      daysSinceLast + " days since the last entry here — worth scheduling something.",
    ]));
  }

  // Secondary — avg rating if rated
  var rated = meetings.filter(function (m) { return m.rating; });
  if (rated.length > 0) {
    var avg = rated.reduce(function (sum, m) { return sum + m.rating; }, 0) / rated.length;
    if (avg >= 4) {
      parts.push(pickV(seed + "mr", [
        "Meetings have been rating well — " + avg.toFixed(1) + "/5 on average.",
        "Avg rating of " + avg.toFixed(1) + "/5. Good quality conversations here.",
      ]));
    } else if (avg < 3) {
      parts.push(pickV(seed + "mr", [
        "Meeting quality is averaging " + avg.toFixed(1) + "/5. Worth checking what's not landing.",
        "Ratings are trending low at " + avg.toFixed(1) + "/5. Something to look at.",
      ]));
    }
  }

  // Closing — overdue follow-ups or unsummarized
  var overdueFU     = meetings.filter(function (m) { return m.follow_up_date && m.follow_up_date < today; });
  var unsummarized  = meetings.filter(function (m) { return !m.pip_summary; });

  if (overdueFU.length > 0) {
    parts.push(pickV(seed + "mc", [
      overdueFU.length + " follow-up" + (overdueFU.length !== 1 ? "s are" : " is") + " past due. Don't let those sit.",
      overdueFU.length + " overdue follow-up" + (overdueFU.length !== 1 ? "s" : "") + " in here — address those before the next call.",
    ]));
  } else if (unsummarized.length > 0 && meetings.length > 1) {
    parts.push(pickV(seed + "mc", [
      unsummarized.length + " meeting" + (unsummarized.length !== 1 ? "s" : "") + " still without a Pip summary.",
      unsummarized.length + " unsummarized — hit 'Ask Pip' when you have a moment.",
    ]));
  }

  return parts.join(" ");
}

function CopyBtn({ text }) {
  var [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2000);
    });
  }
  return (
    <SecBtn onClick={handleCopy} style={{ fontSize: 11, padding: "4px 10px" }}>
      {copied ? "Copied" : "Copy"}
    </SecBtn>
  );
}

// sendToGauge is now a method on MeetingsTab that uses the addProject hook.
// Left here as a legacy stub — replaced by handleSendToGauge below.

function copySummary(meeting, accountName) {
  var lines = [];
  lines.push((accountName ? accountName + " — " : "") + (meeting.title || "Meeting") + " (" + meeting.meeting_date + ")");
  if (meeting.notes)          lines.push("\nNotes:\n" + meeting.notes);
  if (meeting.action_items)   lines.push("\nAction Items:\n" + meeting.action_items);
  if (meeting.commitments)    lines.push("\nCommitments:\n" + meeting.commitments);
  if (meeting.follow_up_date) lines.push("\nFollow-up: " + meeting.follow_up_date);
  navigator.clipboard.writeText(lines.join("\n")).then(function () {
    showToast("Summary copied");
  }).catch(function () {
    showToast("Copy failed", "error");
  });
}

export function MeetingsTab({ meetings, accountName, accountId, userId, openItems, addItem, addProject, onLogMeeting, onDelete, onAddMeeting, onUpdateMeeting, logCorrection, accountObjective, accountSystems, glossary }) {
  var [loadingPip, setLoadingPip] = useState({});
  var [pipErrors, setPipErrors]   = useState({});
  var [confirmDeleteId, setConfirmDeleteId] = useState(null);
  var [editingMeeting, setEditingMeeting]   = useState(null);

  function handleSendToGauge(m) {
    if (addProject) {
      // Use the proper hook — includes logActivity, account_ids[], and realtime refresh.
      addProject({
        account_id:  accountId,
        account_ids: accountId ? [accountId] : [],
        meeting_id:  m.id,
        title:       (m.commitments || "").slice(0, 120) || "From meeting " + m.meeting_date,
        status:      "planned",
      }).then(function () {
        showToast("Project added to Gauge");
      }).catch(function (err) {
        showToast((err && err.message) || "Failed to send to Gauge", "error");
      });
    } else {
      // Fallback: direct insert (no addProject available — MeetingsTab used outside AccountDetail).
      supabase
        .from("gauge_projects")
        .insert([{
          user_id:    userId,
          account_id: accountId,
          meeting_id: m.id,
          title:      (m.commitments || "").slice(0, 120),
          status:     "planned",
        }])
        .then(function (result) {
          if (result.error) { showToast("Failed to send to Gauge", "error"); return; }
          showToast("Project added to Gauge");
        });
    }
  }

  function handleAskPip(m) {
    if (loadingPip[m.id]) return;
    // Cost-floor short-circuit: if Pip already summarized this meeting, don't
    // pay the Anthropic call again. The saved summary lives in m.pip_summary
    // (set the first time around). Per CLAUDE.md "Pip cost strategy": never
    // regenerate what's already saved.
    if (m.pip_summary && m.pip_summary.trim()) {
      showToast("Pip summary already saved — using cached version");
      return;
    }
    setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: true }); });
    setPipErrors(function (prev) { return Object.assign({}, prev, { [m.id]: null }); });
    callAskPip({
      mode:             "meeting",
      accountName:      accountName,
      meeting:          m,
      accountObjective: accountObjective || "",
      accountSystems:   Array.isArray(accountSystems) ? accountSystems : [],
      glossary:         Array.isArray(glossary) ? glossary : [],
    }).then(function (data) {
      setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: false }); });
      if (data.summary && onUpdateMeeting) {
        var patch = { pip_summary: data.summary, pip_email: data.email || null };
        if (data.action_items && data.action_items.trim()) {
          patch.action_items = data.action_items;
        }
        // Rename placeholder titles ("Email — May 29") to Pip's short summary
        // title so meeting lists read at a glance. Never overwrite a title the
        // user/Pip already set deliberately.
        if (data.short_title && isDefaultMeetingTitle(m.title)) {
          patch.title = data.short_title;
        }
        onUpdateMeeting(m.id, patch)
          .then(function () {
            var n = data.action_items ? data.action_items.split(/\r?\n/).filter(function (l) { return l.trim(); }).length : 0;
            if (n > 0) {
              showToast("Pip summary saved · " + n + " action item" + (n !== 1 ? "s" : ""));
            } else {
              showToast("Pip summary saved · no action items found", "warning");
            }
          })
          .catch(function (err) { console.error("Pip save failed:", err); });
      }
    }).catch(function () {
      setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: false }); });
      setPipErrors(function (prev) { return Object.assign({}, prev, { [m.id]: "Pip is unavailable right now." }); });
    });
  }

  function handleDelete(id) {
    var meeting = meetings.find(function (m) { return m.id === id; });
    onDelete(id)
      .then(function () {
        var onUndo = onAddMeeting && meeting ? function () {
          var data = Object.assign({}, meeting);
          delete data.id;
          delete data.created_at;
          delete data.folio_accounts;
          onAddMeeting(data);
        } : null;
        showToast("Meeting deleted", "warning", onUndo);
      })
      .catch(function (err) { showToast(err.message || "Couldn't delete — check your connection", "error"); });
    setConfirmDeleteId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PipInsightCard text={buildMeetingsInsight(meetings, accountName)} />

      {meetings.length === 0 && (
        <EmptyState
          lattice={false}
          compact
          title="No meetings on record."
          subtitle="Log one after your next call."
          cta={<AmberBtn onClick={onLogMeeting} style={{ fontSize: 12 }}>+ Log a Conversation</AmberBtn>}
        />
      )}

      {meetings.map(function (m, index) {
        var isLoading   = !!loadingPip[m.id];
        var pipErr      = pipErrors[m.id];
        var confirmDel  = confirmDeleteId === m.id;
        return (
          <Card key={m.id} className="list-item" style={{ animationDelay: index * 0.04 + "s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <div style={{ fontFamily: MT_SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, letterSpacing: "-0.005em", lineHeight: 1.2 }}>
                    {m.title || "Meeting"}
                  </div>
                  {m.pip_summary && (
                    <span style={{
                      fontFamily: MT_MONO,
                      fontSize: 9,
                      fontWeight: 500,
                      color: C.accent,
                      background: C.accentFaint,
                      border: "1px solid " + C.accentLine,
                      borderRadius: 4,
                      padding: "1px 5px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}>✦ Summarized</span>
                  )}
                </div>
                <div style={{ fontFamily: MT_MONO, fontSize: 10, color: C.textMuted, marginTop: 4, letterSpacing: "0.04em", fontFeatureSettings: '"tnum"' }}>
                  {m.meeting_date
                    ? fmtMedium(m.meeting_date)
                    : ""}
                </div>
                {m.attendees && m.attendees.length > 0 && (
                  <div style={{ fontFamily: MT_MONO, fontSize: 10, color: C.accent, marginTop: 3, letterSpacing: "0.04em" }}>
                    {m.attendees.join(', ')}
                  </div>
                )}
              </div>
              {m.rating && (
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  {STARS.map(function (s) {
                    return (
                      <span key={s} style={{ fontSize: 12, color: s <= m.rating ? C.yellow : C.textMuted }}>★</span>
                    );
                  })}
                </div>
              )}
            </div>

            {m.pip_summary && (
              <div style={{ background: C.accentGlow, border: "1px solid " + C.accentLine, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <PipMark size={7} color={C.accent} glow />
                  <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Pip Summary</span>
                </div>
                <MarkdownText text={m.pip_summary} style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65 }} />
              </div>
            )}

            {m.notes && (
              <div style={{ marginBottom: 10 }}>
                <FL>Notes</FL>
                <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.notes}</div>
              </div>
            )}

            {m.talking_points && (
              <div style={{ marginBottom: 10 }}>
                <FL>Talking Points</FL>
                <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.talking_points}</div>
              </div>
            )}

            {m.action_items && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <FL style={{ marginBottom: 0 }}>Action Items</FL>
                  {addItem && (
                    <AddToTasksButton
                      actionItemsText={m.action_items}
                      accountId={accountId}
                      openItems={openItems}
                      addItem={addItem}
                    />
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.yellow, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.action_items}</div>
              </div>
            )}

            {m.commitments && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <FL style={{ marginBottom: 0 }}>Commitments</FL>
                  {userId && (
                    <button
                      onClick={function (e) { e.stopPropagation(); handleSendToGauge(m); }}
                      style={{
                        background: C.statusPlanned.bg,
                        border: "1px solid " + C.statusPlanned.border,
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 600,
                        color: C.statusPlanned.text,
                        fontFamily: "'Inter', system-ui, sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      → Gauge
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 14, color: C.blue, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.commitments}</div>
              </div>
            )}

            {m.follow_up_date && (
              <div style={{ marginBottom: 10 }}>
                <FL>Follow-up</FL>
                <div style={{ fontSize: 14, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                  {fmtMedium(m.follow_up_date)}
                </div>
              </div>
            )}

            {m.pip_email && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PipMark size={7} color={C.accent} glow />
                    <FL style={{ marginBottom: 0 }}>Draft Follow-Up Email</FL>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <a
                      href={"mailto:?body=" + encodeURIComponent(m.pip_email)}
                      style={{
                        fontSize: 11, padding: "4px 10px",
                        background: C.accentGlow, border: "1px solid " + C.accentSubtle,
                        borderRadius: 6, color: C.accent, textDecoration: "none",
                        fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 500,
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      Open in Mail
                    </a>
                    <CopyBtn text={m.pip_email} />
                  </div>
                </div>
                <div style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.textSub, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {m.pip_email}
                </div>
              </div>
            )}

            {!m.pip_summary && onUpdateMeeting && (
              <div style={{ marginTop: 10 }}>
                {pipErr && (
                  <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>{pipErr}</div>
                )}
                <button
                  onClick={function () { handleAskPip(m); }}
                  disabled={isLoading}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid " + C.accentSubtle, borderRadius: 8, padding: "6px 12px", cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  <PipMark size={6} color={C.accent} glow pulse={isLoading} />
                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
                    {isLoading ? "Asking Pip..." : "Ask Pip"}
                  </span>
                </button>
              </div>
            )}

            {(onDelete || onUpdateMeeting) && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
                <SecBtn
                  onClick={function () { copySummary(m, accountName); }}
                  style={{ fontSize: 10, padding: "3px 8px" }}
                >
                  Copy Summary
                </SecBtn>
                {onUpdateMeeting && (
                  <SecBtn
                    onClick={function () { setEditingMeeting(m); }}
                    style={{ fontSize: 11, padding: "5px 12px" }}
                  >
                    Edit
                  </SecBtn>
                )}
                {onDelete && !confirmDel && (
                  <DangerBtn
                    onClick={function () { setConfirmDeleteId(m.id); }}
                    style={{ fontSize: 11, padding: "5px 12px" }}
                  >
                    Delete
                  </DangerBtn>
                )}
                {onDelete && confirmDel && (
                  <>
                    <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                    <DangerBtn
                      onClick={function () { handleDelete(m.id); }}
                      style={{ fontSize: 11, padding: "5px 12px" }}
                    >
                      Yes
                    </DangerBtn>
                    <SecBtn
                      onClick={function () { setConfirmDeleteId(null); }}
                      style={{ fontSize: 11, padding: "5px 12px" }}
                    >
                      No
                    </SecBtn>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onLogMeeting}>
        + Log New Conversation
      </AmberBtn>

      {editingMeeting && (
        <EditMeetingModal
          meeting={editingMeeting}
          onSave={function (id, data, meta) {
            return onUpdateMeeting(id, data).then(function () {
              showToast("Meeting updated");
              if (
                logCorrection &&
                meta &&
                meta.originalPipSummary &&
                meta.newPipSummary &&
                meta.originalPipSummary.trim() !== meta.newPipSummary.trim()
              ) {
                logCorrection({
                  correction_type: 'summary_edit',
                  account_id:      editingMeeting.account_id,
                  meeting_id:      id,
                  original_value:  { text: meta.originalPipSummary },
                  corrected_value: { text: meta.newPipSummary },
                  reason:          null,
                });
              }
              setEditingMeeting(null);
            }).catch(function (err) {
              showToast(err.message || "Couldn't save — check your connection", "error");
            });
          }}
          onClose={function () { setEditingMeeting(null); }}
        />
      )}
    </div>
  );
}
