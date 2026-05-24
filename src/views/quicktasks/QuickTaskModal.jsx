import { useState } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { ChipDropdown } from "../../components/ChipDropdown";

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
  var [saving, setSaving]           = useState(false);
  var [error, setError]             = useState(null);
  var [confirmDelete, setConfirmDelete] = useState(false);

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
      if (!existing) showToast("Task added");
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
          <FL htmlFor="task-title">Task</FL>
          <InputField
            id="task-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="What needs to get done?"
            autoFocus
          />
        </div>

        <div>
          <FL htmlFor="task-notes">Notes (optional)</FL>
          <TextArea
            id="task-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Customer name, phone, details..."
            rows={2}
          />
        </div>

        <div>
          <FL>Account (optional)</FL>
          <ChipDropdown
            options={["— No account —"].concat(sortedAccounts.map(function (a) { return a.name; }))}
            value={accountId ? (sortedAccounts.find(function (a) { return a.id === accountId; }) || {}).name || "" : "— No account —"}
            onSelect={function (name) {
              if (name === "— No account —") { setAccountId(""); return; }
              var acct = sortedAccounts.find(function (a) { return a.name === name; });
              if (acct) setAccountId(acct.id);
            }}
            placeholder="— No account —"
          />
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
                    border: "1px solid " + (active ? C.accentSubtle : C.border),
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
                {!confirmDelete && (
                  <DangerBtn onClick={function () { setConfirmDelete(true); }}>Delete</DangerBtn>
                )}
                {confirmDelete && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                    <DangerBtn onClick={handleDelete}>Delete it</DangerBtn>
                    <SecBtn onClick={function () { setConfirmDelete(false); }}>No</SecBtn>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecBtn onClick={onClose}>Cancel</SecBtn>
            <AmberBtn onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : existing ? "Done" : "Add Task"}
            </AmberBtn>
          </div>
        </div>

      </div>
    </Modal>
  );
}
