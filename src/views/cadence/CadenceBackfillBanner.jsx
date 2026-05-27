import { useState } from "react";
import { C, glass } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { getFrequencyLabel } from "../../lib/cadenceUtils";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function dismissKey(accountId) { return "folio_cadence_backfill_dismissed_" + accountId; }

export function isBackfillDismissed(accountId) {
  try { return localStorage.getItem(dismissKey(accountId)) === "1"; } catch (e) { return false; }
}

export function CadenceBackfillBanner({ account, cadences, meetings, onUpdateMeeting, onDismiss }) {
  var [open, setOpen]       = useState(false);
  var [saving, setSaving]   = useState(false);
  var [assignments, setAssignments] = useState({});

  if (!account || !cadences || cadences.length === 0 || !meetings) return null;
  var meetingCads = cadences.filter(function (c) { return c.type !== "task" && c.account_id === account.id; });
  if (meetingCads.length === 0) return null;
  if (isBackfillDismissed(account.id)) return null;
  var unassigned = meetings.filter(function (m) {
    return m.account_id === account.id && !m.cadence_id && m.status !== "draft";
  });
  if (unassigned.length === 0) return null;

  function handleDismiss() {
    try { localStorage.setItem(dismissKey(account.id), "1"); } catch (e) {}
    if (onDismiss) onDismiss();
  }

  function handleSaveAll() {
    setSaving(true);
    var ops = Object.keys(assignments).map(function (mid) {
      var cid = assignments[mid];
      if (!cid) return null;
      return onUpdateMeeting(mid, { cadence_id: cid });
    }).filter(Boolean);
    Promise.all(ops).then(function () {
      setSaving(false);
      var n = ops.length;
      showToast(n + " meeting" + (n !== 1 ? "s" : "") + " assigned");
      handleDismiss();
    }).catch(function () {
      setSaving(false);
      showToast("Couldn't save assignments", "error");
    });
  }

  if (!open) {
    return (
      <div style={Object.assign({}, glass, {
        borderLeft: "3px solid " + C.yellow,
        borderRadius: 10, padding: "10px 13px",
        marginBottom: 12, display: "flex",
        alignItems: "center", justifyContent: "space-between", gap: 10,
      })}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 2 }}>
            Cadence Backfill
          </div>
          <div style={{ fontSize: 12, color: C.textSub }}>
            {unassigned.length} meeting{unassigned.length !== 1 ? "s" : ""} aren't tied to a cadence yet.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <SecBtn onClick={handleDismiss} style={{ fontSize: 11, padding: "5px 10px" }}>Dismiss</SecBtn>
          <AmberBtn onClick={function () { setOpen(true); }} style={{ fontSize: 11, padding: "5px 10px" }}>
            Assign →
          </AmberBtn>
        </div>
      </div>
    );
  }

  return (
    <div style={Object.assign({}, glass, {
      borderLeft: "3px solid " + C.yellow,
      borderRadius: 10, padding: "13px 14px",
      marginBottom: 12,
    })}>
      <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: MONO, marginBottom: 8 }}>
        Assign meetings to cadences
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {unassigned.map(function (m) {
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{m.title || "Meeting"}</div>
                <div style={{ fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                  {m.meeting_date && new Date(m.meeting_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <select
                value={assignments[m.id] || ""}
                onChange={function (e) {
                  var val = e.target.value;
                  setAssignments(function (prev) { var next = Object.assign({}, prev); next[m.id] = val; return next; });
                }}
                style={{
                  background: C.bgDark, border: "1px solid " + C.border,
                  borderRadius: 8, padding: "6px 10px", color: C.text, fontSize: 12,
                  fontFamily: INTER, cursor: "pointer", flexShrink: 0,
                  colorScheme: "dark", appearance: "none",
                }}
              >
                <option value="">— Skip —</option>
                {meetingCads.map(function (c) {
                  return <option key={c.id} value={c.id}>{getFrequencyLabel(c) || "Cadence"}</option>;
                })}
              </select>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <SecBtn onClick={function () { setOpen(false); }} style={{ fontSize: 11, padding: "5px 12px" }}>Close</SecBtn>
        <AmberBtn onClick={handleSaveAll} disabled={saving || Object.keys(assignments).length === 0} style={{ fontSize: 11, padding: "5px 12px" }}>
          {saving ? "Saving…" : "Save assignments"}
        </AmberBtn>
      </div>
    </div>
  );
}
