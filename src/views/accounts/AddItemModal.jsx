import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function AddItemModal({ accountId, userId, existing, onSave, onClose }) {
  var [text, setText]    = useState(existing ? (existing.text || "") : "");
  var [due, setDue]      = useState(existing ? (existing.due_date || "") : "");
  var [owner, setOwner]  = useState(existing ? (existing.owner || "") : "");
  var [loading, setLoading] = useState(false);
  var [error, setError]    = useState(null);

  var isEdit = !!existing;

  function handleSave() {
    if (!text.trim()) { setError("Item description is required."); return; }
    setLoading(true);
    setError(null);
    var data = {
      text:     text.trim(),
      due_date: due || null,
      owner:    owner.trim() || null,
    };
    var promise = isEdit
      ? onSave(existing.id, data)
      : onSave(Object.assign({ account_id: accountId, user_id: userId }, data));
    promise
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
    <Modal title={isEdit ? "Edit Item" : "Add Open Item"} onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="item-description">Description</FL>
          <InputField
            id="item-description"
            value={text}
            onChange={function (e) { setText(e.target.value); }}
            placeholder="What needs to happen?"
          />
        </div>

        <div>
          <FL htmlFor="item-due-date">Due Date</FL>
          <InputField
            id="item-due-date"
            type="date"
            value={due}
            onChange={function (e) { setDue(e.target.value); }}
          />
        </div>

        <div>
          <FL htmlFor="item-owner">Owner</FL>
          <InputField
            id="item-owner"
            value={owner}
            onChange={function (e) { setOwner(e.target.value); }}
            placeholder="Who owns this?"
          />
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

        <div style={{ display: "flex", gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Save Item" : "Add Item"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
