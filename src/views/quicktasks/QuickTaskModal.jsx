import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function QuickTaskModal({ existing, onSave, onDelete, onClose }) {
  var [title, setTitle]     = useState(existing ? existing.title : "");
  var [notes, setNotes]     = useState(existing ? (existing.notes || "") : "");
  var [reminderTime, setReminder] = useState(function () {
    if (!existing || !existing.reminder_at) return "";
    var d = new Date(existing.reminder_at);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  });
  var [saving, setSaving] = useState(false);
  var [error, setError]   = useState(null);

  function buildReminderAt(timeStr) {
    if (!timeStr) return null;
    var today = new Date().toISOString().split("T")[0];
    return new Date(today + "T" + timeStr + ":00").toISOString();
  }

  function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    onSave({
      title:       title.trim(),
      notes:       notes.trim() || null,
      reminder_at: buildReminderAt(reminderTime),
    }).then(function () {
      setSaving(false);
      onClose();
    }).catch(function (e) {
      setSaving(false);
      setError(e.message || "Something went wrong.");
    });
  }

  function handleMarkDone() {
    onSave({ done: true }).then(onClose);
  }

  function handleDelete() {
    onDelete(existing.id);
    onClose();
  }

  return (
    <Modal title={existing ? "Edit Task" : "Quick Task"} onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL>Task</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="What needs to get done?"
            autoFocus
          />
        </div>

        <div>
          <FL>Notes (optional)</FL>
          <TextArea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Customer name, phone, details..."
            rows={2}
          />
        </div>

        <div>
          <FL>Remind me at (optional)</FL>
          <input
            type="time"
            value={reminderTime}
            onChange={function (e) { setReminder(e.target.value); }}
            style={{
              width: "100%",
              background: C.bgDark,
              border: "1px solid " + C.border,
              borderRadius: 10,
              padding: "10px 14px",
              color: reminderTime ? C.text : C.textMuted,
              fontSize: 16,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: C.red }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {existing && (
              <>
                <AmberBtn onClick={handleMarkDone} disabled={saving}>
                  ✓ Done
                </AmberBtn>
                <DangerBtn onClick={handleDelete}>
                  Delete
                </DangerBtn>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecBtn onClick={onClose}>Cancel</SecBtn>
            <AmberBtn onClick={handleSave} disabled={saving || !title.trim()}>
              {existing ? "Save" : "Add Task"}
            </AmberBtn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
