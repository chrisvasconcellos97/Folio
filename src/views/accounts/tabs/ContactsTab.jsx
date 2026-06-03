import { useState, useEffect, useMemo } from "react";
import { C } from "../../../lib/colors";
import { computeContactEngagement } from "../../../lib/contactEngagement";

var CT_SERIF = "'Fraunces', Georgia, serif";
var CT_MONO  = "'JetBrains Mono', ui-monospace, monospace";
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

// Safe-URL allow-list: only emit http(s)/mailto/tel hrefs. Anything else
// (javascript:, data:, etc.) gets replaced with `#` so a tampered contact
// row can't be turned into a script-execution surface.
function safeHref(href) {
  if (typeof href !== "string" || !href) return "#";
  var trimmed = href.trim();
  // Reject any non-allowed scheme; "://" check catches relative-looking but
  // protocol-bearing strings.
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return "#";
}

function ContactLink({ href, label, color }) {
  return (
    <a
      href={safeHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 11, color: color || C.accent, textDecoration: "none", background: C.accentFaint, padding: "2px 8px", borderRadius: 6, border: "1px solid " + C.accentMid, whiteSpace: "nowrap" }}
    >
      {label}
    </a>
  );
}

function exportContacts(contacts, accountName) {
  var headers = ["Name", "Title", "Phone", "Email", "LinkedIn", "POC", "Notes"];
  var rows = contacts.map(function (c) {
    return [
      c.name || "",
      c.title || "",
      c.phone || "",
      c.email || "",
      c.linkedin || "",
      c.is_poc ? "Yes" : "No",
      (c.notes || "").replace(/"/g, '""'),
    ].map(function (v) { return '"' + v + '"'; }).join(",");
  });
  var csv = [headers.join(",")].concat(rows).join("\n");
  var blob = new Blob([csv], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (accountName || "contacts") + "-contacts.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ContactsTab({ contacts, meetings, accountId, accountName, onAdd, onDelete, onAddContact, onUpdate }) {
  var [confirmDeleteId, setConfirmDeleteId]       = useState(null);
  var [editingContact, setEditingContact]         = useState(null);
  var [selected, setSelected]                     = useState({});
  var [editingRelationship, setEditingRelationship] = useState(null); // contact id or null
  var [relRoleDraft, setRelRoleDraft]             = useState("unknown");
  var [relNoteDraft, setRelNoteDraft]             = useState("");

  // Pip Tier B — derive last-seen engagement from meeting attendees
  var engagement = useMemo(function () {
    return computeContactEngagement(contacts, meetings || []);
  }, [contacts, meetings]);

  useEffect(function () { setSelected({}); }, [contacts.length]);

  // Leaders sort first, then by name. Sort is stable across renders.
  contacts = (contacts || []).slice().sort(function (a, b) {
    var la = a.is_leader ? 0 : 1;
    var lb = b.is_leader ? 0 : 1;
    if (la !== lb) return la - lb;
    return (a.name || "").localeCompare(b.name || "");
  });

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
                <div style={{ fontFamily: CT_SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", letterSpacing: "-0.005em", lineHeight: 1.2 }}>
                  {c.is_leader && (
                    <span aria-label="Leader" style={{ fontFamily: CT_MONO, fontSize: 9, color: C.yellow, fontWeight: 600, letterSpacing: "0.06em", background: "rgba(251,191,36,0.12)", padding: "2px 6px", borderRadius: 10, textTransform: "uppercase" }}>LEADER</span>
                  )}
                  {c.name}
                  {c.is_primary && (
                    <span title="Primary contact" aria-label="Primary contact" style={{ fontSize: 12, lineHeight: 1 }}>📌</span>
                  )}
                  {c.is_poc && (
                    <span style={{ fontFamily: CT_MONO, fontSize: 9, color: C.yellow, fontWeight: 600, letterSpacing: "0.06em", background: "rgba(251,191,36,0.12)", padding: "2px 6px", borderRadius: 10, textTransform: "uppercase" }}>
                      POC
                    </span>
                  )}
                  {c.relationship_role === "champion" && (
                    <span
                      title="Champion"
                      onClick={function () { setEditingRelationship(c.id); setRelRoleDraft(c.relationship_role || "unknown"); setRelNoteDraft(c.relationship_note || ""); }}
                      style={{ fontFamily: CT_MONO, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", background: C.accentFaint, border: "1px solid " + C.accentLine, color: C.accent }}
                    >
                      CHAMPION
                    </span>
                  )}
                  {c.relationship_role === "blocker" && (
                    <span
                      title="Blocker"
                      onClick={function () { setEditingRelationship(c.id); setRelRoleDraft(c.relationship_role || "unknown"); setRelNoteDraft(c.relationship_note || ""); }}
                      style={{ fontFamily: CT_MONO, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", background: C.redFaint, border: "1px solid " + C.redLine, color: C.red }}
                    >
                      BLOCKER
                    </span>
                  )}
                </div>

                {c.title && (
                  <div style={{ fontFamily: CT_MONO, fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>{c.title}</div>
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

                {(function () {
                  var e = c.name ? engagement[c.name] : null;
                  if (!e) return null;
                  if (e.daysSince === null && e.meetingCount === 0) {
                    return (
                      <div style={{ fontFamily: CT_MONO, fontSize: 11, color: C.textMuted, marginTop: 5 }}>
                        Not yet in a meeting
                      </div>
                    );
                  }
                  if (e.daysSince === null) return null;
                  var isStale = e.daysSince > 60;
                  return (
                    <div style={{ fontFamily: CT_MONO, fontSize: 11, color: isStale ? C.yellow : C.textMuted, marginTop: 5 }}>
                      {"Last seen: " + e.daysSince + "d ago"}
                      {e.meetingCount > 0 && (
                        <span style={{ marginLeft: 8, color: C.textMuted }}>{"· " + e.meetingCount + " meeting" + (e.meetingCount !== 1 ? "s" : "")}</span>
                      )}
                    </div>
                  );
                })()}

                {/* Relationship note — shown when role is set and note exists */}
                {c.relationship_role && c.relationship_role !== "unknown" && c.relationship_note && (
                  <div style={{ fontFamily: CT_MONO, fontSize: 10.5, color: C.textSoft, marginTop: 4, fontStyle: "italic" }}>
                    {c.relationship_note}
                  </div>
                )}

                {/* Inline relationship editor */}
                {editingRelationship === c.id && (
                  <div style={{ marginTop: 10, background: C.surface, border: "1px solid " + C.rule, borderRadius: 8, padding: "12px" }}>
                    <div style={{ fontFamily: CT_MONO, fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Relationship role
                    </div>
                    <select
                      value={relRoleDraft}
                      onChange={function (e) { setRelRoleDraft(e.target.value); }}
                      style={{ width: "100%", fontSize: 13, fontFamily: CT_MONO, color: C.text, background: C.bg, border: "1px solid " + C.rule, borderRadius: 6, padding: "7px 10px", marginBottom: 8, outline: "none", cursor: "pointer" }}
                    >
                      <option value="unknown">Not set</option>
                      <option value="champion">Champion</option>
                      <option value="blocker">Blocker</option>
                      <option value="neutral">Neutral</option>
                    </select>
                    <textarea
                      value={relNoteDraft}
                      onChange={function (e) { setRelNoteDraft(e.target.value.slice(0, 120)); }}
                      placeholder={"Why? e.g. 'owns the budget'"}
                      rows={2}
                      style={{ width: "100%", fontSize: 13, fontFamily: CT_MONO, color: C.text, background: C.bg, border: "1px solid " + C.rule, borderRadius: 6, padding: "7px 10px", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5, marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={function () {
                          if (onUpdate) {
                            onUpdate(c.id, { relationship_role: relRoleDraft, relationship_note: relNoteDraft })
                              .then(function () { showToast("Relationship saved"); setEditingRelationship(null); })
                              .catch(function (err) { showToast(err && err.message || "Couldn't save", "error"); });
                          } else {
                            setEditingRelationship(null);
                          }
                        }}
                        style={{ background: C.accentDeep, border: "1px solid " + C.accent, borderRadius: 6, padding: "5px 14px", fontFamily: CT_MONO, fontSize: 11, color: C.bg, cursor: "pointer" }}
                      >
                        Save
                      </button>
                      <button
                        onClick={function () { setEditingRelationship(null); }}
                        style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "5px 10px", fontFamily: CT_MONO, fontSize: 11, color: C.textMuted, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                {onUpdate && (
                  <SecBtn
                    onClick={function () {
                      if (editingRelationship === c.id) {
                        setEditingRelationship(null);
                      } else {
                        setEditingRelationship(c.id);
                        setRelRoleDraft(c.relationship_role || "unknown");
                        setRelNoteDraft(c.relationship_note || "");
                      }
                    }}
                    style={{ fontSize: 10, padding: "4px 10px" }}
                  >
                    {"☆ Role"}
                  </SecBtn>
                )}
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
                fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Email Selected
            </a>
            <button
              onClick={function () { setSelected({}); }}
              style={{
                background: "transparent", border: "1px solid " + C.border, borderRadius: 7,
                padding: "5px 10px", fontSize: 12, color: C.textMuted, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <SecBtn
          onClick={function () { exportContacts(contacts, accountName); }}
          style={{ width: "100%", fontSize: 12 }}
        >
          Export CSV
        </SecBtn>
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
