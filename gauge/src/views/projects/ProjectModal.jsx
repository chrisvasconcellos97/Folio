import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var GB     = "rgba(103,200,249,0.12)";
var GB_BDR = "rgba(103,200,249,0.28)";

var STATUS_OPTS = [
  { value: "planned",     label: "Planned"     },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked",     label: "Blocked"     },
  { value: "complete",    label: "Complete"    },
  { value: "on_hold",     label: "On Hold"     },
];

var PRIORITY_OPTS = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

export function ProjectModal({ existing, accounts, onSave, onDelete, onClose }) {
  var [title, setTitle]         = useState(existing ? existing.title             : "");
  var [description, setDesc]    = useState(existing ? existing.description || "" : "");
  var [status, setStatus]       = useState(existing ? existing.status            : "planned");
  var [priority, setPriority]   = useState(existing ? existing.priority          : "medium");
  var [dueDate, setDueDate]     = useState(existing ? existing.due_date || ""    : "");
  var [accountId, setAccountId] = useState(existing ? existing.account_id || ""  : "");
  var [assignee, setAssignee]   = useState(existing ? (existing.assignee || "")  : "");
  var [saving, setSaving]       = useState(false);
  var [confirmDel, setConfirm]  = useState(false);

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
      assignee:   assignee.trim() || null,
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
            placeholder="What are we tracking?"
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
            placeholder="Scope, goals, context…"
            rows={3}
          />
        </div>

        <div>
          <FL>Assignee (optional)</FL>
          <InputField
            value={assignee}
            onChange={function (e) { setAssignee(e.target.value); }}
            placeholder="Who owns this?"
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

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <div>
            {existing && !confirmDel && (
              <button
                onClick={function () { setConfirm(true); }}
                style={{
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.red,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            )}
            {existing && confirmDel && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <button
                  onClick={handleDelete}
                  style={{
                    background: "rgba(248,113,113,0.12)",
                    border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 20,
                    padding: "6px 13px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.red,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Yes, delete
                </button>
                <button
                  onClick={function () { setConfirm(false); }}
                  style={{
                    background: C.bgCardAlt,
                    border: "1px solid " + C.border,
                    borderRadius: 20,
                    padding: "6px 13px",
                    fontSize: 11,
                    color: C.textSub,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "1px solid " + C.border,
                borderRadius: 20,
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                color: C.textSub,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              style={{
                background: !title.trim() || saving ? "rgba(103,200,249,0.05)" : GB,
                border: "1px solid " + (!title.trim() || saving ? C.border : GB_BDR),
                borderRadius: 20,
                padding: "8px 22px",
                fontSize: 12,
                fontWeight: 600,
                color: !title.trim() || saving ? C.textMuted : C.accent,
                fontFamily: "'DM Sans', sans-serif",
                cursor: !title.trim() || saving ? "default" : "pointer",
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
