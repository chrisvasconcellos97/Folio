import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var PRESETS = [
  { label: "30 min", minutes: 30  },
  { label: "1 hr",   minutes: 60  },
  { label: "1.5 hr", minutes: 90  },
  { label: "2 hr",   minutes: 120 },
  { label: "3 hr",   minutes: 180 },
];

export function QuickTaskModal({ existing, accounts, onSave, onDelete, onClose }) {
  var [title, setTitle]         = useState(existing ? existing.title : "");
  var [notes, setNotes]         = useState(existing ? (existing.notes || "") : "");
  var [accountId, setAccountId] = useState(existing ? (existing.account_id || "") : "");
  var [reminderMinutes, setReminderMinutes] = useState(null);
  var [clearReminder, setClearReminder]     = useState(false);
  var [saving, setSaving] = useState(false);
  var [error, setError]   = useState(null);

  var existingReminderLabel = existing && existing.reminder_at
    ? new Date(existing.reminder_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  function togglePreset(minutes) {
    setClearReminder(false);
    setReminderMinutes(function (prev) { return prev === minutes ? null : minutes; });
  }

  function handleClearReminder() {
    setReminderMinutes(null);
    setClearReminder(true);
  }

  function buildReminderAt() {
    if (clearReminder) return null;
    if (reminderMinutes !== null) return new Date(Date.now() + reminderMinutes * 60000).toISOString();
    return existing ? existing.reminder_at : null;
  }

  function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    onSave({
      title:       title.trim(),
      notes:       notes.trim() || null,
      account_id:  accountId || null,
      reminder_at: buildReminderAt(),
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

  var sortedAccounts = (accounts || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

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
          <FL>Account (optional)</FL>
          <select
            value={accountId}
            onChange={function (e) { setAccountId(e.target.value); }}
            style={{
              width: "100%",
              background: C.bgDark,
              border: "1px solid " + C.border,
              borderRadius: 10,
              padding: "10px 14px",
              color: accountId ? C.text : C.textMuted,
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
              appearance: "none",
              cursor: "pointer",
            }}
          >
            <option value="">— No account —</option>
            {sortedAccounts.map(function (a) {
              return <option key={a.id} value={a.id}>{a.name}</option>;
            })}
          </select>
        </div>

        <div>
          <FL>Remind me in</FL>
          {existingReminderLabel && !clearReminder && reminderMinutes === null && (
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
              {"Set for " + existingReminderLabel + " · "}
              <span
                onClick={handleClearReminder}
                style={{ color: C.red, cursor: "pointer" }}
              >
                clear
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map(function (p) {
              var active = reminderMinutes === p.minutes;
              return (
                <button
                  key={p.minutes}
                  onClick={function () { togglePreset(p.minutes); }}
                  style={{
                    background: active ? C.bgPillActive : C.bgPill,
                    color: active ? C.accent : C.textMuted,
                    border: "1px solid " + (active ? "rgba(74,155,130,0.3)" : C.border),
                    borderRadius: 20,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: C.red }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {existing && (
              <>
                <AmberBtn onClick={handleMarkDone} disabled={saving}>✓ Done</AmberBtn>
                <DangerBtn onClick={handleDelete}>Delete</DangerBtn>
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
