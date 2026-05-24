import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var STARS = [1, 2, 3, 4, 5];

export function LogMeetingModal({ accountId, userId, contacts, onSave, onClose }) {
  var today = new Date().toISOString().split("T")[0];
  var [title, setTitle]            = useState("");
  var [date, setDate]              = useState(today);
  var [notes, setNotes]            = useState("");
  var [talkingPoints, setTalking]  = useState("");
  var [actionItems, setActions]    = useState("");
  var [commitments, setCommit]     = useState("");
  var [followUp, setFollowUp]      = useState("");
  var [rating, setRating]          = useState(0);
  var [attendees, setAttendees]    = useState([]);
  var [loading, setLoading]        = useState(false);
  var [error, setError]            = useState(null);

  function toggleAttendee(name) {
    setAttendees(function (prev) {
      return prev.includes(name) ? prev.filter(function (n) { return n !== name; }) : prev.concat([name]);
    });
  }

  function handleSave() {
    if (!title.trim()) { setError("Meeting title is required."); return; }
    setLoading(true);
    setError(null);
    onSave({
      account_id:     accountId,
      user_id:        userId,
      title:          title.trim(),
      meeting_date:   date,
      notes:          notes.trim() || null,
      talking_points: talkingPoints.trim() || null,
      action_items:   actionItems.trim() || null,
      commitments:    commitments.trim() || null,
      follow_up_date: followUp || null,
      rating:         rating || null,
      attendees:      attendees.length > 0 ? attendees : null,
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
    <Modal title="Log Meeting" onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="log-title">Meeting Title</FL>
          <InputField
            id="log-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. Quarterly Business Review"
          />
        </div>

        <div>
          <FL htmlFor="log-date">Date</FL>
          <InputField
            id="log-date"
            type="date"
            value={date}
            onChange={function (e) { setDate(e.target.value); }}
          />
        </div>

        {contacts && contacts.length > 0 && (
          <div>
            <FL>Attendees</FL>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {contacts.map(function (c) {
                var active = attendees.includes(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={function () { toggleAttendee(c.name); }}
                    style={{
                      background: active ? "rgba(74,155,130,0.15)" : "rgba(255,255,255,0.04)",
                      border: "1px solid " + (active ? "rgba(74,155,130,0.4)" : C.border),
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      color: active ? C.accent : C.textMuted,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    {active ? "✓ " : ""}{c.name}
                    {c.title ? " · " + c.title : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <FL htmlFor="log-notes">Notes</FL>
          <TextArea
            id="log-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="What happened? General observations..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="log-talking-points">Talking Points</FL>
          <TextArea
            id="log-talking-points"
            value={talkingPoints}
            onChange={function (e) { setTalking(e.target.value); }}
            placeholder="Key topics discussed..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="log-action-items">Action Items</FL>
          <TextArea
            id="log-action-items"
            value={actionItems}
            onChange={function (e) { setActions(e.target.value); }}
            placeholder="Who does what by when..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="log-commitments">Commitments / Promises Made</FL>
          <TextArea
            id="log-commitments"
            value={commitments}
            onChange={function (e) { setCommit(e.target.value); }}
            placeholder="Anything promised or committed..."
            rows={2}
          />
        </div>

        <div>
          <FL htmlFor="log-follow-up">Follow-up Date</FL>
          <InputField
            id="log-follow-up"
            type="date"
            value={followUp}
            onChange={function (e) { setFollowUp(e.target.value); }}
          />
        </div>

        <div>
          <FL>Rating</FL>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {STARS.map(function (s) {
              return (
                <span
                  key={s}
                  onClick={function () { setRating(s); }}
                  style={{
                    fontSize: 22,
                    cursor: "pointer",
                    color: s <= rating ? C.yellow : C.textMuted,
                    transition: "color 0.1s",
                  }}
                >
                  ★
                </span>
              );
            })}
          </div>
        </div>

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

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Meeting"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
