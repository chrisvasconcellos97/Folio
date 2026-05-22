import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { DangerBtn } from "../../components/Buttons";

var GB = "rgba(103,200,249,0.12)";
var GB_BORDER = "rgba(103,200,249,0.25)";

var STATUS_OPTS = [
  { value: "active",    label: "Active"    },
  { value: "on_hold",   label: "On Hold"   },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

var PRIORITY_OPTS = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

export function ProjectModal({ existing, accounts, onSave, onDelete, onClose }) {
  var [title, setTitle]           = useState(existing ? existing.title           : "");
  var [description, setDesc]      = useState(existing ? existing.description || "" : "");
  var [status, setStatus]         = useState(existing ? existing.status          : "active");
  var [priority, setPriority]     = useState(existing ? existing.priority        : "medium");
  var [dueDate, setDueDate]       = useState(existing ? existing.due_date || ""  : "");
  var [accountId, setAccountId]   = useState(existing ? existing.account_id || "" : "");
  var [saving, setSaving]         = useState(false);
  var [confirmDel, setConfirmDel] = useState(false);

  function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    onSave({
      title:       title.trim(),
      description: description.trim() || null,
      status,
      priority,
      due_date:   dueDate || null,
      account_id: accountId || null,
    }).then(function () {
      setSaving(false);
      onClose();
    }).catch(function () {
      setSaving(false);
    });
  }

  function handleDelete() {
    if (onDelete && existing) {
      onDelete(existing.id).then(onClose);
    }
  }

  return (
    <Modal title={existing ? "Edit Project" : "New Project"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        <div>
          <FL>Project Title *</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="What are we building?"
            autoFocus
          />
        </div>

        <div>
          <FL>Account</FL>
          <SelectField
            value={accountId}
            onChange={function (e) { setAccountId(e.target.value); }}
          >
            <option value="">No account linked</option>
            {(accounts || []).map(function (a) {
              return <option key={a.id} value={a.id}>{a.name}</option>;
            })}
          </SelectField>
        </div>

        <div>
          <FL>Description</FL>
          <TextArea
            value={description}
            onChange={function (e) { setDesc(e.target.value); }}
            placeholder="Scope, goals, context..."
            rows={3}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL>Status</FL>
            <SelectField
              value={status}
              onChange={function (e) { setStatus(e.target.value); }}
            >
              {STATUS_OPTS.map(function (o) {
                return <option key={o.value} value={o.value}>{o.label}</option>;
              })}
            </SelectField>
          </div>
          <div>
            <FL>Priority</FL>
            <SelectField
              value={priority}
              onChange={function (e) { setPriority(e.target.value); }}
            >
              {PRIORITY_OPTS.map(function (o) {
                return <option key={o.value} value={o.value}>{o.label}</option>;
              })}
            </SelectField>
          </div>
        </div>

        <div>
          <FL>Due Date</FL>
          <InputField
            type="date"
            value={dueDate}
            onChange={function (e) { setDueDate(e.target.value); }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div>
            {existing && !confirmDel && (
              <DangerBtn
                onClick={function () { setConfirmDel(true); }}
                style={{ fontSize: 11, padding: "6px 13px" }}
              >
                Delete
              </DangerBtn>
            )}
            {existing && confirmDel && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <DangerBtn onClick={handleDelete} style={{ fontSize: 11, padding: "6px 13px" }}>
                  Yes
                </DangerBtn>
                <button
                  onClick={function () { setConfirmDel(false); }}
                  style={{
                    background: C.bgCardAlt, border: "1px solid " + C.border,
                    borderRadius: 20, padding: "6px 13px", fontSize: 11,
                    color: C.textSub, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                  }}
                >
                  No
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "1px solid " + C.border,
                borderRadius: 20, padding: "8px 18px", fontSize: 12,
                fontWeight: 600, color: C.textSub, fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              style={{
                background: !title.trim() || saving ? "rgba(103,200,249,0.06)" : GB,
                border: "1px solid " + GB_BORDER,
                borderRadius: 20, padding: "8px 22px", fontSize: 12,
                fontWeight: 600, color: !title.trim() || saving ? C.textMuted : C.blue,
                fontFamily: "'DM Sans', sans-serif", cursor: !title.trim() || saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : existing ? "Save Changes" : "Add Project"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
