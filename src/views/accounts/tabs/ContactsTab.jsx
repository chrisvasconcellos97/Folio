import { C } from "../../../lib/colors";
import { AmberBtn, DangerBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { pickV } from "../../../lib/metricsUtils";

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
      style={{ fontSize: 11, color: color || C.accent, textDecoration: "none", background: "rgba(74,155,130,0.07)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(74,155,130,0.15)", whiteSpace: "nowrap" }}
    >
      {label}
    </a>
  );
}

export function ContactsTab({ contacts, accountId, onAdd, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <PipInsightCard text={buildContactsInsight(contacts, accountId)} />

      {contacts.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
          No contacts yet.
        </div>
      )}

      {contacts.map(function (c) {
        return (
          <Card key={c.id}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.is_poc ? "rgba(74,155,130,0.2)" : "rgba(74,155,130,0.07)", border: "1px solid rgba(74,155,130,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: C.accent, flexShrink: 0, marginTop: 2 }}>
                {c.name ? c.name.charAt(0).toUpperCase() : "?"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {c.name}
                  {c.is_poc && (
                    <span style={{ fontSize: 9, color: C.yellow, fontWeight: 600, letterSpacing: "0.06em", background: "rgba(251,191,36,0.12)", padding: "2px 6px", borderRadius: 10 }}>
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

              {onDelete && (
                <DangerBtn onClick={function () { onDelete(c.id); }} style={{ fontSize: 10, padding: "4px 10px", flexShrink: 0 }}>
                  Remove
                </DangerBtn>
              )}
            </div>
          </Card>
        );
      })}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onAdd}>
        + Add Contact
      </AmberBtn>
    </div>
  );
}
