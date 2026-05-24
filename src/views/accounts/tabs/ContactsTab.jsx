import { useState, useEffect } from "react";
import { C } from "../../../lib/colors";
import { AmberBtn, DangerBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { pickV } from "../../../lib/metricsUtils";
import { showToast } from "../../../components/Toast";
import { EditContactModal } from "../EditContactModal";

function buildContactsInsight(contacts, accountId) {
  var seed = (accountId || "x") + new Date().getDate().toString();

  if (contacts.length === 0) {
    return pickV(seed + "ct0", [
      "No contacts added yet. At minimum you'll want a primary point of contact in here.",
      "Contact list is empty. Add your main POC to start — everything else can fill in over time.",
    ]);
  }

  var poc       = contacts.find(function (c) { return c.is_poc; });
  var withNotes = contacts.filter(function (c) { return c.notes; });

  var parts = [];

  // Lead
  if (poc) {
    parts.push(pickV(seed + "ctl", [
      (contacts.length > 1 ? contacts.length + " contacts here. " : "") + poc.name + (poc.title ? " (" + poc.title + ")" : "") + " is your point of contact.",
      "Point of contact is " + poc.name + ". " + (contacts.length > 1 ? contacts.length - 1 + " other" + (contacts.length - 1 !== 1 ? "s" : "") + " logged too." : ""),
    ]));
  } else if (contacts.length === 1) {
    parts.push(pickV(seed + "ctl", [
      contacts[0].name + " is the only contact here — no POC marked yet.",
      "One contact logged: " + contacts[0].name + ". Flag them as POC if they're your main relationship.",
    ]));
  } else {
    parts.push(pickV(seed + "ctl", [
      contacts.length + " contacts logged, but no primary point of contact marked. Worth setting one.",
      contacts.length + " people in here. Consider marking your main contact as POC.",
    ]));
  }

  // Secondary — missing info on POC
  if (poc && !poc.email && !poc.phone) {
    parts.push(pickV(seed + "cts", [
      "No email or phone on file for " + poc.name + " — worth filling that in.",
      poc.name + " is missing contact info. Add an email or phone while you have it.",
    ]));
  } else if (poc && !poc.email) {
    parts.push(pickV(seed + "cts", [
      poc.name + " doesn't have an email on file.",
    ]));
  } else if (poc && !poc.phone) {
    parts.push(pickV(seed + "cts", [
      poc.name + " doesn't have a phone number on file.",
    ]));
  }

  // Closing — completeness
  var withInfo = contacts.filter(function (c) { return c.email || c.phone; });
  if (contacts.length > 1 && withInfo.length === contacts.length) {
    parts.push(pickV(seed + "ctc", [
      "Everyone has reach info filled in — good.",
      "All contacts have a phone or email. Clean.",
    ]));
  } else if (withNotes.length > 0 && contacts.length > 1) {
    parts.push(pickV(seed + "ctc", [
      withNotes.length + " contact" + (withNotes.length !== 1 ? "s have" : " has") + " notes attached. Useful.",
    ]));
  }

  return parts.join(" ");
}

function ContactLink({ href, label, color }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ fontSize: 11, color: color || C.accent, textDecoration: "none", background: C.accentFaint, padding: "2px 8px", borderRadius: 6, border: "1px solid " + C.accentMid, whiteSpace: "nowrap" }}
    >
      {label}
    </a>
  );
}

export function ContactsTab({ contacts, accountId, onAdd, onDelete, onAddContact, onUpdate }) {
  var [confirmDeleteId, setConfirmDeleteId] = useState(null);
  var [editingContact, setEditingContact]   = useState(null);
  var [selected, setSelected]               = useState({});

  useEffect(function () { setSelected({}); }, [contacts.length]);

  function handleDelete(id) {
    var contact = contacts.find(function (c) { return c.id === id; });
    onDelete(id)
      .then(function () {
        var onUndo = onAddContact && contact ? function () {
          var data = Object.assign({}, contact);
          delete data.id;
          delete data.created_at;
          onAddContact(data);
        } : null;
        showToast("Contact removed", "warning", onUndo);
      })
      .catch(function (err) { showToast(err.message || "Couldn't delete — check your connection", "error"); });
    setConfirmDeleteId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <PipInsightCard text={buildContactsInsight(contacts, accountId)} />

      {contacts.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>No contacts added yet. Who do you usually talk to here?</div>
          <AmberBtn onClick={onAdd} style={{ fontSize: 12 }}>+ Add Contact</AmberBtn>
        </div>
      )}

      {contacts.map(function (c, index) {
        var confirmDel = confirmDeleteId === c.id;
        return (
          <Card key={c.id} className="list-item" style={{ animationDelay: index * 0.04 + "s" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {c.email && (
                <input
                  type="checkbox"
                  checked={!!selected[c.id]}
                  onChange={function (e) {
                    setSelected(function (prev) {
                      var next = Object.assign({}, prev);
                      if (e.target.checked) next[c.id] = c.email;
                      else delete next[c.id];
                      return next;
                    });
                  }}
                  style={{ marginTop: 12, accentColor: C.accent, cursor: "pointer", flexShrink: 0 }}
                  aria-label={"Select " + c.name}
                />
              )}
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.is_poc ? C.accentLine : C.accentFaint, border: "1px solid " + C.accentLine, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: C.accent, flexShrink: 0, marginTop: 2 }}>
                {c.name ? c.name.charAt(0).toUpperCase() : "?"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {c.name}
                  {c.is_poc && (
                    <span style={{ fontSize: 10, color: C.yellow, fontWeight: 600, letterSpacing: "0.06em", background: "rgba(251,191,36,0.12)", padding: "2px 6px", borderRadius: 10 }}>
                      POC
                    </span>
                  )}
                </div>

                {c.title && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{c.title}</div>
                )}

                {(c.phone || c.email || c.linkedin) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {c.phone && <ContactLink href={"tel:" + c.phone} label={"📞 " + c.phone} />}
                    {c.email && <ContactLink href={"mailto:" + c.email} label={"✉ " + c.email} />}
                    {c.linkedin && (
                      <ContactLink
                        href={c.linkedin.startsWith("http") ? c.linkedin : "https://" + c.linkedin}
                        label="LinkedIn"
                        color={C.blue}
                      />
                    )}
                  </div>
                )}

                {c.notes && (
                  <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{c.notes}</div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {onUpdate && (
                  <SecBtn
                    onClick={function () { setEditingContact(c); }}
                    style={{ fontSize: 10, padding: "4px 10px" }}
                  >
                    Edit
                  </SecBtn>
                )}
                {onDelete && !confirmDel && (
                  <DangerBtn
                    onClick={function () { setConfirmDeleteId(c.id); }}
                    style={{ fontSize: 10, padding: "4px 10px" }}
                  >
                    Remove
                  </DangerBtn>
                )}
                {onDelete && confirmDel && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                    <DangerBtn
                      onClick={function () { handleDelete(c.id); }}
                      style={{ fontSize: 10, padding: "4px 10px" }}
                    >
                      Yes
                    </DangerBtn>
                    <SecBtn
                      onClick={function () { setConfirmDeleteId(null); }}
                      style={{ fontSize: 10, padding: "4px 10px" }}
                    >
                      No
                    </SecBtn>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {Object.keys(selected).length > 0 && (
        <div style={{ background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>
            {Object.keys(selected).length} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={"mailto:" + Object.values(selected).join(",")}
              style={{
                background: C.accent, color: "#fff", borderRadius: 7, padding: "5px 14px",
                fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Email Selected
            </a>
            <button
              onClick={function () { setSelected({}); }}
              style={{
                background: "transparent", border: "1px solid " + C.border, borderRadius: 7,
                padding: "5px 10px", fontSize: 12, color: C.textMuted, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onAdd}>
        + Add Contact
      </AmberBtn>

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onSave={function (id, data) {
            return onUpdate(id, data).then(function () {
              showToast("Contact updated");
              setEditingContact(null);
            }).catch(function (err) {
              showToast(err.message || "Couldn't save — check your connection", "error");
            });
          }}
          onClose={function () { setEditingContact(null); }}
        />
      )}
    </div>
  );
}
