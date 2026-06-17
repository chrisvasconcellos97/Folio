import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

export function AddContactModal({ accountId, userId, onSave, onClose }) {
  var [name, setName]         = useState("");
  var [title, setTitle]       = useState("");
  var [phone, setPhone]       = useState("");
  var [email, setEmail]       = useState("");
  var [linkedin, setLinkedin] = useState("");
  var [poc, setPoc]           = useState(false);
  var [leader, setLeader]     = useState(false);
  var [primary, setPrimary]   = useState(false);
  var [notes, setNotes]       = useState("");
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  function handleSave() {
    if (!name.trim()) { setError("Contact name is required."); return; }
    setLoading(true);
    setError(null);
    onSave({
      account_id: accountId,
      user_id:    userId,
      name:       name.trim(),
      title:      title.trim()    || null,
      phone:      phone.trim()    || null,
      email:      email.trim()    || null,
      linkedin:   linkedin.trim() || null,
      is_poc:     poc,
      is_leader:  leader,
      is_primary: primary,
      notes:      notes.trim()    || null,
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
          <FL htmlFor="contact-name">Name</FL>
          <InputField
            id="contact-name"
            value={name}
            onChange={function (e) { setName(e.target.value); }}
            placeholder="Full name"
          />
        </div>

        <div>
          <FL htmlFor="contact-title">Title / Role</FL>
          <InputField
            id="contact-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. VP of Sales"
          />
        </div>

        <div>
          <FL htmlFor="contact-phone">Phone</FL>
          <InputField
            id="contact-phone"
            value={phone}
            onChange={function (e) { setPhone(e.target.value); }}
            placeholder="e.g. (555) 123-4567"
            type="tel"
          />
        </div>

        <div>
          <FL htmlFor="contact-email">Email</FL>
          <InputField
            id="contact-email"
            value={email}
            onChange={function (e) { setEmail(e.target.value); }}
            placeholder="work@company.com"
            type="email"
          />
        </div>

        <div>
          <FL htmlFor="contact-linkedin">LinkedIn</FL>
          <InputField
            id="contact-linkedin"
            value={linkedin}
            onChange={function (e) { setLinkedin(e.target.value); }}
            placeholder="linkedin.com/in/username"
          />
        </div>

        <div>
          <FL htmlFor="contact-notes">Notes</FL>
          <TextArea
            id="contact-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Personal notes, preferred comm style, etc."
            rows={2}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "primary", label: "Primary (📌)",              desc: "Day-to-day go-to contact",       color: C.accent,  val: primary, set: setPrimary },
            { key: "poc",    label: "Primary Point of Contact", desc: "Main person at this account",   color: C.accent,  val: poc,    set: setPoc    },
            { key: "leader", label: "Leader / Decision Maker",  desc: "Has authority to approve deals", color: C.yellow, val: leader, set: setLeader },
          ].map(function (t) {
            return (
              <div
                key={t.key}
                onClick={function () { t.set(!t.val); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  padding: "10px 14px",
                  background: t.val ? "rgba(74,155,130,0.07)" : C.bgDark,
                  border: "1px solid " + (t.val ? t.color : C.border),
                  borderRadius: 10,
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: "1.5px solid " + (t.val ? t.color : C.accentDim),
                    background: t.val ? t.color : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {t.val && <span style={{ fontSize: 11, color: C.bg }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.val ? t.color : C.text }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                    {t.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: C.redFaint,
              border: "1px solid " + C.redLine,
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
