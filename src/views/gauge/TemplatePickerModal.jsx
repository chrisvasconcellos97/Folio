import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

export function TemplatePickerModal({ templates, onUse, onUpdate, onDelete, onClose }) {
  var [editingId, setEditingId]       = useState(null);
  var [editTitle, setEditTitle]       = useState("");
  var [editDesc, setEditDesc]         = useState("");
  var [editDuration, setEditDuration] = useState("");
  var [saving, setSaving]             = useState(false);
  var [confirmDelete, setConfirm]     = useState(null);

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setEditTitle(tpl.title || "");
    setEditDesc(tpl.description || "");
    setEditDuration(tpl.total_duration_days != null ? String(tpl.total_duration_days) : "");
    setConfirm(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDesc("");
    setEditDuration("");
  }

  function handleSave(tpl) {
    if (!editTitle.trim() || saving) return;
    setSaving(true);
    var dur = parseInt(editDuration, 10);
    onUpdate(tpl.id, {
      title: editTitle.trim(),
      description: editDesc.trim() || null,
      total_duration_days: (!isNaN(dur) && dur > 0) ? dur : null,
    })
      .then(function () {
        setSaving(false);
        cancelEdit();
      })
      .catch(function () { setSaving(false); });
  }

  function handleDelete(id) {
    onDelete(id).catch(function () {});
    setConfirm(null);
  }

  return (
    <Modal title="Templates" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(!templates || templates.length === 0) ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            color: C.textMuted,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            No templates yet — save a project as a template to reuse it.
          </div>
        ) : (
          templates.map(function (tpl) {
            var stageCount = tpl.stages ? tpl.stages.length : 0;
            var isEditing  = editingId === tpl.id;

            return (
              <div
                key={tpl.id}
                style={{
                  background: C.surface2,
                  border: "1px solid " + (isEditing ? C.accentBorder : C.rule),
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, lineHeight: 1.3 }}>
                        {tpl.title}
                      </div>
                      {tpl.total_duration_days != null && (
                        <div style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: C.textMuted,
                          background: C.surface,
                          border: "1px solid " + C.rule,
                          borderRadius: 4,
                          padding: "1px 6px",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}>
                          Est. {tpl.total_duration_days}d
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                      {stageCount} stage{stageCount !== 1 ? "s" : ""}
                      {tpl.description ? " · " + tpl.description.slice(0, 60) + (tpl.description.length > 60 ? "…" : "") : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!isEditing && (
                      <>
                        <button
                          onClick={function () { startEdit(tpl); }}
                          style={{
                            background: "none",
                            border: "1px solid " + C.rule,
                            borderRadius: 6,
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: C.textSoft,
                            fontFamily: INTER,
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                        {confirmDelete === tpl.id ? (
                          <button
                            onClick={function () { handleDelete(tpl.id); }}
                            style={{
                              background: "none",
                              border: "1px solid " + C.red,
                              borderRadius: 6,
                              padding: "5px 12px",
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.red,
                              fontFamily: INTER,
                              cursor: "pointer",
                            }}
                          >
                            Sure?
                          </button>
                        ) : (
                          <button
                            onClick={function () { setConfirm(tpl.id); }}
                            style={{
                              background: "none",
                              border: "1px solid " + C.rule,
                              borderRadius: 6,
                              padding: "5px 12px",
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.textMuted,
                              fontFamily: INTER,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          onClick={function () {
                            var cleanedTpl = Object.assign({}, tpl, {
                              stages: (tpl.stages || []).map(function (s) {
                                return Object.assign({}, s, {
                                  completed_at: null,
                                  sub_stages: (s.sub_stages || []).map(function (sub) {
                                    return Object.assign({}, sub, { completed_at: null });
                                  }),
                                });
                              }),
                            });
                            onUse(cleanedTpl);
                          }}
                          style={{
                            background: C.accentDeep,
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 16px",
                            color: C.bg,
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: INTER,
                            cursor: "pointer",
                          }}
                        >
                          Use
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <FL>Template Name</FL>
                      <InputField
                        value={editTitle}
                        onChange={function (e) { setEditTitle(e.target.value); }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <FL>Description</FL>
                      <InputField
                        value={editDesc}
                        onChange={function (e) { setEditDesc(e.target.value); }}
                        placeholder="Optional note about this template"
                      />
                    </div>
                    <div>
                      <FL>Estimated Duration (days)</FL>
                      <InputField
                        type="number"
                        min="1"
                        value={editDuration}
                        onChange={function (e) { setEditDuration(e.target.value); }}
                        placeholder="Auto-derives from stage offsets if blank"
                      />
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                      Stages are edited by using the template and saving it again.
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={cancelEdit}
                        style={{
                          background: "none",
                          border: "1px solid " + C.rule,
                          borderRadius: 6,
                          padding: "6px 14px",
                          fontSize: 12,
                          color: C.textSoft,
                          fontFamily: INTER,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={function () { handleSave(tpl); }}
                        disabled={!editTitle.trim() || saving}
                        style={{
                          background: C.accentDeep,
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.bg,
                          fontFamily: INTER,
                          cursor: "pointer",
                          opacity: (!editTitle.trim() || saving) ? 0.5 : 1,
                        }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid " + C.border,
            borderRadius: 20,
            padding: "8px 18px",
            fontSize: 12,
            fontWeight: 600,
            color: C.textSoft,
            fontFamily: INTER,
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
