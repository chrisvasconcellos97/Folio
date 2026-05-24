import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function EditContactModal({ contact, onSave, onClose }) {
  var [name, setName]         = useState(contact.name || "");
  var [title, setTitle]       = useState(contact.title || "");
  var [phone, setPhone]       = useState(contact.phone || "");
  var [email, setEmail]       = useState(contact.email || "");
  var [linkedin, setLinkedin] = useState(contact.linkedin || "");
  var [poc, setPoc]           = useState(!!contact.is_poc);
  var [notes, setNotes]       = useState(contact.notes || "");
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  function handleSave() {
    if (!name.trim()) { setError("Contact name is required."); return; }
    setLoading(true);
    setError(null);
    onSave(contact.id, {
      name:     name.trim(),
      title:    title.trim()    || null,
      phone:    phone.trim()    || null,
      email:    email.trim()    || null,
      linkedin: linkedin.trim() || null,
      is_poc:   poc,
      notes:    notes.trim()    || null,
    }).catch(function (err) {
      setLoading(false);
      setError(err ? (err.message || "Something went wrong.") : "Something went wrong.");
    });
  }

  return (
    <Modal title="Edit Contact" onClose={onClose} width={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="edit-contact-name">Name</FL>
          <InputField
            id="edit-contact-name"
            value={name}
            onChange={function (e) { setName(e.target.value); }}
            placeholder="Full name"
          />
        </div>

        <div>
          <FL htmlFor="edit-contact-title">Title / Role</FL>
          <InputField
            id="edit-contact-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. VP of Sales"
          />
        </div>

        <div>
          <FL htmlFor="edit-contact-phone">Phone</FL>
          <InputField
            id="edit-contact-phone"
            value={phone}
            onChange={function (e) { setPhone(e.target.value); }}
            placeholder="e.g. (555) 123-4567"
            type="tel"
          />
        </div>

        <div>
          <FL htmlFor="edit-contact-email">Email</FL>
          <InputField
            id="edit-contact-email"
            value={email}
            onChange={function (e) { setEmail(e.target.value); }}
            placeholder="work@company.com"
            type="email"
          />
        </div>

        <div>
          <FL htmlFor="edit-contact-linkedin">LinkedIn</FL>
          <InputField
            id="edit-contact-linkedin"
            value={linkedin}
            onChange={function (e) { setLinkedin(e.target.value); }}
            placeholder="linkedin.com/in/username"
          />
        </div>

        <div>
          <FL htmlFor="edit-contact-notes">Notes</FL>
          <TextArea
            id="edit-contact-notes"
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
            background: poc ? "rgba(74,155,130,0.08)" : C.bgDark,
            border: "1px solid " + (poc ? "rgba(74,155,130,0.3)" : C.border),
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
            {loading ? "Saving..." : "Save Contact"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
