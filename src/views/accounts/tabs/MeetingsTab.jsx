import { useState } from "react";
import { C } from "../../../lib/colors";
import { AmberBtn, DangerBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";
import { PipMark } from "../../../components/PipMark";
import { callAskPip } from "../../../lib/pip";

var STARS = [1, 2, 3, 4, 5];

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

export function MeetingsTab({ meetings, accountName, onLogMeeting, onDelete, onUpdateMeeting }) {
  var [loadingPip, setLoadingPip] = useState({});
  var [pipErrors, setPipErrors]   = useState({});

  function handleAskPip(m) {
    if (loadingPip[m.id]) return;
    setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: true }); });
    setPipErrors(function (prev) { return Object.assign({}, prev, { [m.id]: null }); });
    callAskPip({
      mode: "meeting",
      accountName: accountName,
      meeting: m,
    }).then(function (data) {
      setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: false }); });
      if (data.summary && onUpdateMeeting) {
        onUpdateMeeting(m.id, { pip_summary: data.summary, pip_email: data.email || null });
      }
    }).catch(function () {
      setLoadingPip(function (prev) { return Object.assign({}, prev, { [m.id]: false }); });
      setPipErrors(function (prev) { return Object.assign({}, prev, { [m.id]: "Pip is unavailable right now." }); });
    });
  }

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
        var isLoading = !!loadingPip[m.id];
        var pipErr    = pipErrors[m.id];
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
                {m.attendees && m.attendees.length > 0 && (
                  <div style={{ fontSize: 11, color: C.accent, marginTop: 3 }}>
                    {m.attendees.join(', ')}
                  </div>
                )}
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

            {/* Pip Summary */}
            {m.pip_summary && (
              <div
                style={{
                  background: C.accentGlow,
                  border: "1px solid rgba(200,136,58,0.2)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <PipMark size={7} color={C.accent} glow />
                  <span
                    style={{
                      fontSize: 9,
                      color: C.accent,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Pip Summary
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65 }}>
                  {m.pip_summary}
                </div>
              </div>
            )}

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

            {/* Pip Follow-Up Email */}
            {m.pip_email && (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PipMark size={7} color={C.accent} glow />
                    <FL style={{ marginBottom: 0 }}>Draft Follow-Up Email</FL>
                  </div>
                  <CopyBtn text={m.pip_email} />
                </div>
                <div
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid " + C.border,
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: C.textSub,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.pip_email}
                </div>
              </div>
            )}

            {/* Ask Pip — only if no summary yet */}
            {!m.pip_summary && onUpdateMeeting && (
              <div style={{ marginTop: 10 }}>
                {pipErr && (
                  <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>{pipErr}</div>
                )}
                <button
                  onClick={function () { handleAskPip(m); }}
                  disabled={isLoading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "1px solid rgba(200,136,58,0.25)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    opacity: isLoading ? 0.5 : 1,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <PipMark size={6} color={C.accent} glow pulse={isLoading} />
                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
                    {isLoading ? "Asking Pip..." : "Ask Pip"}
                  </span>
                </button>
              </div>
            )}

            {(onDelete) && (
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
