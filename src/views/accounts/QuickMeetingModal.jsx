import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { TextArea } from "../../components/InputField";

export function QuickMeetingModal({ accountId, userId, accountName, contacts, onSave, onClose }) {
  var today = new Date().toISOString().split("T")[0];
  var dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  var titleDefault = "Meeting — " + new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  var [notes, setNotes]       = useState("");
  var [attendees, setAttendees] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  function toggleAttendee(name) {
    setAttendees(function (prev) {
      return prev.includes(name) ? prev.filter(function (n) { return n !== name; }) : prev.concat([name]);
    });
  }

  function handleSave() {
    setLoading(true);
    setError(null);
    onSave({
      account_id:   accountId,
      user_id:      userId,
      title:        titleDefault,
      meeting_date: today,
      notes:        notes.trim() || null,
      attendees:    attendees.length > 0 ? attendees : null,
    })
      .then(function () {
        setLoading(false);
        onClose();
      })
      .catch(function (err) {
        setLoading(false);
        setError(err.message);
      });
  }

  return (
    <Modal title={accountName} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>
          {dateLabel}
        </div>

        {contacts && contacts.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Attendees
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
              {contacts.map(function (c) {
                var active = attendees.includes(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={function () { toggleAttendee(c.name); }}
                    style={{
                      background: active ? C.accentMid : "rgba(255,255,255,0.04)",
                      border: "1px solid " + (active ? C.accentBorder : C.border),
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      color: active ? C.accent : C.textMuted,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    {active ? "✓ " : ""}{c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <TextArea
          value={notes}
          onChange={function (e) { setNotes(e.target.value); }}
          placeholder="What happened? Drop your notes here..."
          rows={6}
          autoFocus
        />

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: C.red,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Log Meeting"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
