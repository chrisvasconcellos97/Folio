import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { DangerBtn } from "../../components/Buttons";

var GB = "rgba(103,200,249,0.12)";
var GB_BORDER = "rgba(103,200,249,0.25)";

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
  var [title, setTitle]             = useState(existing ? existing.title           : "");
  var [description, setDesc]        = useState(existing ? existing.description || "" : "");
  var [status, setStatus]           = useState(existing ? existing.status          : "planned");
  var [priority, setPriority]       = useState(existing ? existing.priority        : "medium");
  var [dueDate, setDueDate]         = useState(existing ? existing.due_date || ""  : "");
  var [accountId, setAccountId]     = useState(existing ? existing.account_id || "" : "");
  var [assignee, setAssignee]       = useState(existing ? existing.assignee || ""  : "");
  var [requestedBy, setRequestedBy] = useState(existing ? existing.requested_by || "" : "");
  var [stages, setStages]           = useState(
    existing && existing.stages && existing.stages.length > 0
      ? existing.stages
      : []
  );
  var [newStageTitle, setNewStageTitle] = useState("");
  var [saving, setSaving]           = useState(false);
  var [confirmDel, setConfirmDel]   = useState(false);

  function addStage() {
    if (!newStageTitle.trim()) return;
    setStages(function (prev) {
      return prev.concat([{ title: newStageTitle.trim(), completed_at: null }]);
    });
    setNewStageTitle("");
  }

  function toggleStage(idx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== idx) return s;
        return Object.assign({}, s, {
          completed_at: s.completed_at ? null : new Date().toISOString(),
        });
      });
    });
  }

  function removeStage(idx) {
    setStages(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
  }

  function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    onSave({
      title:        title.trim(),
      description:  description.trim() || null,
      status,
      priority,
      due_date:     dueDate || null,
      account_id:   accountId || null,
      assignee:     assignee.trim() || null,
      requested_by: requestedBy.trim() || null,
      stages:       stages,
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL>Assigned To</FL>
            <InputField
              value={assignee}
              onChange={function (e) { setAssignee(e.target.value); }}
              placeholder="Email or name"
            />
          </div>
          <div>
            <FL>Requested By</FL>
            <InputField
              value={requestedBy}
              onChange={function (e) { setRequestedBy(e.target.value); }}
              placeholder="Who asked for this?"
            />
          </div>
        </div>

        {/* Stages */}
        <div>
          <FL>Stages</FL>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {stages.map(function (s, i) {
              var done = !!s.completed_at;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    onClick={function () { toggleStage(i); }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: done ? C.accent : "transparent",
                      border: "1.5px solid " + (done ? C.accent : C.border),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {done && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{
                    flex: 1,
                    fontSize: 13,
                    color: done ? C.textMuted : C.text,
                    textDecoration: done ? "line-through" : "none",
                  }}>
                    {s.title}
                  </span>
                  <button
                    onClick={function () { removeStage(i); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.textMuted,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={newStageTitle}
              onChange={function (e) { setNewStageTitle(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addStage(); } }}
              placeholder="Add a stage…"
              style={{
                flex: 1,
                background: C.bgDark,
                border: "1px solid " + C.border,
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 14,
                color: C.text,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
              }}
            />
            <button
              onClick={addStage}
              style={{
                background: C.accentFaint,
                border: "1px solid " + C.accentLine,
                borderRadius: 8,
                padding: "7px 12px",
                color: C.accent,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
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
                fontWeight: 600, color: !title.trim() || saving ? C.textMuted : "rgba(103,200,249,0.9)",
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
