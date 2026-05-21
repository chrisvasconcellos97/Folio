import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function AddItemModal({ accountId, userId, onSave, onClose }) {
  var [text, setText]    = useState("");
  var [due, setDue]      = useState("");
  var [owner, setOwner]  = useState("");
  var [loading, setLoading] = useState(false);
  var [error, setError]    = useState(null);

  function handleSave() {
    if (!text.trim()) { setError("Item description is required."); return; }
    setLoading(true);
    setError(null);
    onSave({
      account_id: accountId,
      user_id:    userId,
      text:       text.trim(),
      due_date:   due || null,
      owner:      owner.trim() || null,
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
    <Modal title="Add Open Item" onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL>Description</FL>
          <InputField
            value={text}
            onChange={function (e) { setText(e.target.value); }}
            placeholder="What needs to happen?"
          />
        </div>

        <div>
          <FL>Due Date</FL>
          <InputField
            type="date"
            value={due}
            onChange={function (e) { setDue(e.target.value); }}
          />
        </div>

        <div>
          <FL>Owner</FL>
          <InputField
            value={owner}
            onChange={function (e) { setOwner(e.target.value); }}
            placeholder="Who owns this?"
          />
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
            {loading ? "Saving..." : "Add Item"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
