import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var STARS = [1, 2, 3, 4, 5];

export function EditMeetingModal({ meeting, onSave, onClose }) {
  var [title, setTitle]           = useState(meeting.title || "");
  var [date, setDate]             = useState(meeting.meeting_date || "");
  var [notes, setNotes]           = useState(meeting.notes || "");
  var [talkingPoints, setTalking] = useState(meeting.talking_points || "");
  var [actionItems, setActions]   = useState(meeting.action_items || "");
  var [commitments, setCommit]    = useState(meeting.commitments || "");
  var [followUp, setFollowUp]     = useState(meeting.follow_up_date || "");
  var [rating, setRating]         = useState(meeting.rating || 0);
  var [loading, setLoading]       = useState(false);
  var [error, setError]           = useState(null);

  function handleSave() {
    if (!title.trim()) { setError("Meeting title is required."); return; }
    setLoading(true);
    setError(null);
    onSave(meeting.id, {
      title:          title.trim(),
      meeting_date:   date,
      notes:          notes.trim() || null,
      talking_points: talkingPoints.trim() || null,
      action_items:   actionItems.trim() || null,
      commitments:    commitments.trim() || null,
      follow_up_date: followUp || null,
      rating:         rating || null,
    }).catch(function (err) {
      setLoading(false);
      setError(err ? (err.message || "Something went wrong.") : "Something went wrong.");
    });
  }

  return (
    <Modal title="Edit Meeting" onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="edit-meeting-title">Meeting Title</FL>
          <InputField
            id="edit-meeting-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. Quarterly Business Review"
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-date">Date</FL>
          <InputField
            id="edit-meeting-date"
            type="date"
            value={date}
            onChange={function (e) { setDate(e.target.value); }}
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-notes">Notes</FL>
          <TextArea
            id="edit-meeting-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="What happened? General observations..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-talking-points">Talking Points</FL>
          <TextArea
            id="edit-meeting-talking-points"
            value={talkingPoints}
            onChange={function (e) { setTalking(e.target.value); }}
            placeholder="Key topics discussed..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-action-items">Action Items</FL>
          <TextArea
            id="edit-meeting-action-items"
            value={actionItems}
            onChange={function (e) { setActions(e.target.value); }}
            placeholder="Who does what by when..."
            rows={3}
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-commitments">Commitments / Promises Made</FL>
          <TextArea
            id="edit-meeting-commitments"
            value={commitments}
            onChange={function (e) { setCommit(e.target.value); }}
            placeholder="Anything promised or committed..."
            rows={2}
          />
        </div>

        <div>
          <FL htmlFor="edit-meeting-follow-up">Follow-up Date</FL>
          <InputField
            id="edit-meeting-follow-up"
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
                  onClick={function () { setRating(s === rating ? 0 : s); }}
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
