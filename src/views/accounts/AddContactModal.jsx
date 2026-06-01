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

        {[
          { state: poc,     setter: setPoc,     title: "Primary Point of Contact", body: "Main person at this account" },
          { state: leader,  setter: setLeader,  title: "Leader (☆)",               body: "Team lead or decision maker — sorts to top" },
          { state: primary, setter: setPrimary, title: "Primary (📌)",             body: "Day-to-day go-to contact" },
        ].map(function (row) {
          var on = row.state;
          return (
            <div
              key={row.title}
              onClick={function () { row.setter(!on); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                padding: "10px 14px",
                background: on ? C.accentFaint : C.bgDark,
                border: "1px solid " + (on ? C.accentSubtle : C.border),
                borderRadius: 10,
                userSelect: "none",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: "1.5px solid " + (on ? C.accent : C.accentDim),
                  background: on ? C.accent : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {on && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: on ? C.accent : C.text }}>
                  {row.title}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                  {row.body}
                </div>
              </div>
            </div>
          );
        })}

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
