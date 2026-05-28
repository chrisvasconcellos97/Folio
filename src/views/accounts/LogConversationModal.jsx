import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { getFrequencyLabel } from "../../lib/cadenceUtils";

var METHODS = [
  { value: "phone",     label: "Phone" },
  { value: "email",     label: "Email" },
  { value: "video",     label: "Video" },
  { value: "in_person", label: "In Person" },
];

export function LogConversationModal({
  accountId,
  userId,
  contacts,
  cadences,
  defaultCadenceId,
  onSave,
  onClose,
}) {
  var today = new Date().toISOString().split("T")[0];
  var accountCadences = (cadences || []).filter(function (c) {
    return c.account_id === accountId && c.type !== "task";
  });
  var cadenceRequired = accountCadences.length > 0;

  var [title, setTitle]           = useState("");
  var [date, setDate]             = useState(today);
  var [method, setMethod]         = useState("phone");
  var [cadenceId, setCadenceId]   = useState(defaultCadenceId || (accountCadences[0] ? accountCadences[0].id : ""));
  var [notes, setNotes]           = useState("");
  var [attendees, setAttendees]   = useState([]);
  var [followUp, setFollowUp]     = useState("");
  var [asDraft, setAsDraft]       = useState(cadenceRequired);
  var [loading, setLoading]       = useState(false);
  var [error, setError]           = useState(null);

  function toggleAttendee(name) {
    setAttendees(function (prev) {
      return prev.includes(name) ? prev.filter(function (n) { return n !== name; }) : prev.concat([name]);
    });
  }

  function handleSave() {
    if (!title.trim()) { setError("Conversation title is required."); return; }
    if (cadenceRequired && !cadenceId) { setError("Select a cadence — this account uses cadences for all conversations."); return; }
    setLoading(true);
    setError(null);
    onSave({
      account_id:     accountId,
      user_id:        userId,
      cadence_id:     cadenceId || null,
      title:          title.trim(),
      method:         method,
      meeting_date:   date,
      notes:          notes.trim() || null,
      follow_up_date: followUp || null,
      attendees:      attendees.length > 0 ? attendees : null,
      status:         asDraft ? "draft" : "summarized",
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
    <Modal title="Log Conversation" onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="conv-title">Title</FL>
          <InputField
            id="conv-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. Check-in on the QBR"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FL htmlFor="conv-date">Date</FL>
            <InputField
              id="conv-date"
              type="date"
              value={date}
              onChange={function (e) { setDate(e.target.value); }}
            />
          </div>
          <div>
            <FL>Method</FL>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {METHODS.map(function (m) {
                var active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={function () { setMethod(m.value); }}
                    style={{
                      flex: "1 0 calc(50% - 4px)",
                      background: active ? C.accentMid : "var(--c-input-fill)",
                      border: "1px solid " + (active ? C.accentBorder : C.border),
                      borderRadius: 8,
                      padding: "7px 8px",
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      color: active ? C.accent : C.textMuted,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {accountCadences.length > 0 && (
          <div>
            <FL htmlFor="conv-cadence">
              Cadence {cadenceRequired ? "" : <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>}
            </FL>
            <select
              id="conv-cadence"
              value={cadenceId}
              onChange={function (e) { setCadenceId(e.target.value); }}
              style={{
                width: "100%",
                background: C.bgDark,
                border: "1px solid " + C.border,
                borderRadius: 10,
                padding: "10px 14px",
                color: C.text,
                fontSize: 16,
                fontFamily: "'Inter', system-ui, sans-serif",
                colorScheme: "dark",
              }}
            >
              {!cadenceRequired && <option value="">— No cadence —</option>}
              {accountCadences.map(function (c) {
                return (
                  <option key={c.id} value={c.id}>
                    {getFrequencyLabel(c) || "Cadence"}
                  </option>
                );
              })}
            </select>
          </div>
        )}

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
                      background: active ? C.accentMid : "var(--c-input-fill)",
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

        <div>
          <FL htmlFor="conv-notes">Notes</FL>
          <TextArea
            id="conv-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="What happened? Start here — you can keep adding later as a draft."
            rows={4}
          />
        </div>

        <div>
          <FL htmlFor="conv-follow-up">Follow-up Date <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span></FL>
          <InputField
            id="conv-follow-up"
            type="date"
            value={followUp}
            onChange={function (e) { setFollowUp(e.target.value); }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={asDraft}
            onChange={function (e) { setAsDraft(e.target.checked); }}
            style={{ width: 14, height: 14, cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: C.textSub }}>
            Save as draft — keep editing, then summarize with Pip when you're done.
          </span>
        </label>

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
            {loading ? "Saving..." : "Log Conversation"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
