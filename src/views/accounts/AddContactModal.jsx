import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function AddContactModal({ accountId, userId, onSave, onClose }) {
  var [name, setName]    = useState("");
  var [title, setTitle]  = useState("");
  var [poc, setPoc]      = useState(false);
  var [notes, setNotes]  = useState("");
  var [loading, setLoading] = useState(false);
  var [error, setError]    = useState(null);

  function handleSave() {
    if (!name.trim()) { setError("Contact name is required."); return; }
    setLoading(true);
    setError(null);
    onSave({
      account_id: accountId,
      user_id:    userId,
      name:       name.trim(),
      title:      title.trim() || null,
      is_poc:     poc,
      notes:      notes.trim() || null,
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
    <Modal title="Add Contact" onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL>Name</FL>
          <InputField
            value={name}
            onChange={function (e) { setName(e.target.value); }}
            placeholder="Full name"
          />
        </div>

        <div>
          <FL>Title / Role</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. VP of Sales"
          />
        </div>

        <div>
          <FL>Notes</FL>
          <TextArea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Personal notes, preferred comm style, etc."
            rows={2}
          />
        </div>

        <div
          onClick={function () { setPoc(!poc); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            padding: "10px 14px",
            background: poc ? "rgba(200,136,58,0.08)" : C.bgDark,
            border: "1px solid " + (poc ? "rgba(200,136,58,0.3)" : C.border),
            borderRadius: 10,
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1.5px solid " + (poc ? C.accent : C.accentDim),
              background: poc ? C.accent : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {poc && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: poc ? C.accent : C.text }}>
              Primary Point of Contact
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
              Main person at this account
            </div>
          </div>
        </div>

        {error && (
          <div
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

        <div style={{ display: "flex", gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Add Contact"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
