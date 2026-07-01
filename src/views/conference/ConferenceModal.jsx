import { useState } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { showToast } from "../../components/Toast";
import { AccountPicker } from "../../components/AccountPicker";

var INTER = "'Inter', system-ui, sans-serif";

// Conference Prep (item 56) — add/edit a conference. Deliberately about
// PRE-DEPARTURE readiness (closing loose ends + presentation prep), not an
// in-event tool — that's Lanyard's lane. Creating one can optionally pair a
// PTO/Away Mode window for the trip and seed a Gauge project for presentation
// prep; both are orchestrated by the caller (App.jsx has the hooks for both).
export function ConferenceModal({ conference, accounts, onSave, onClose }) {
  var editing = !!conference;
  var [name, setName]           = useState(conference ? conference.name : "");
  var [location, setLocation]   = useState(conference ? conference.location || "" : "");
  var [start, setStart]         = useState(conference ? conference.start_date : "");
  var [end, setEnd]             = useState(conference ? conference.end_date : "");
  var [accountIds, setAccountIds] = useState(conference ? (conference.account_ids || []) : []);
  var [notes, setNotes]         = useState(conference ? conference.notes || "" : "");
  var [createAway, setCreateAway]     = useState(!editing);
  var [createProject, setCreateProject] = useState(!editing);
  var [saving, setSaving] = useState(false);

  function addAccount(id) {
    if (!id) return;
    setAccountIds(function (prev) { return prev.indexOf(id) !== -1 ? prev : prev.concat([id]); });
  }
  function removeAccount(id) {
    setAccountIds(function (prev) { return prev.filter(function (x) { return x !== id; }); });
  }

  function save() {
    if (!name.trim() || !start || !end || saving) return;
    if (end < start) { showToast("End date can't be before the start", "error"); return; }
    setSaving(true);
    Promise.resolve(onSave({
      name: name.trim(),
      location: location.trim() || null,
      start_date: start,
      end_date: end,
      account_ids: accountIds,
      notes: notes.trim() || null,
      createAway: !editing && createAway,
      createProject: !editing && createProject,
    })).then(function () {
      setSaving(false);
      onClose();
    }).catch(function () {
      setSaving(false);
      showToast("Couldn't save the conference", "error");
    });
  }

  return (
    <Modal title={editing ? "Edit conference" : "Add a conference"} onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
          A countdown to help you close loose ends and get presentations ready before you fly out —
          not a schedule for while you're there.
        </div>

        <div>
          <FL>Name</FL>
          <InputField value={name} onChange={function (e) { setName(e.target.value); }} placeholder="e.g. ABPA 2026" />
        </div>
        <div>
          <FL>Location (optional)</FL>
          <InputField value={location} onChange={function (e) { setLocation(e.target.value); }} placeholder="e.g. Las Vegas" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FL>Starts</FL>
            <InputField type="date" value={start} onChange={function (e) { setStart(e.target.value); }} />
          </div>
          <div style={{ flex: 1 }}>
            <FL>Ends</FL>
            <InputField type="date" value={end} onChange={function (e) { setEnd(e.target.value); }} />
          </div>
        </div>

        <div>
          <FL>Partners you'll see there (optional)</FL>
          {accountIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {accountIds.map(function (id) {
                var a = (accounts || []).find(function (x) { return x.id === id; });
                return (
                  <span key={id} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: C.accentFaint, border: "1px solid " + C.accentLine,
                    borderRadius: 999, padding: "4px 6px 4px 11px",
                    fontSize: 12, color: C.text, fontFamily: INTER,
                  }}>
                    {a ? a.name : "Unknown account"}
                    <button
                      type="button"
                      onClick={function () { removeAccount(id); }}
                      aria-label={"Remove " + (a ? a.name : "account")}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 15, lineHeight: 1, padding: "0 2px" }}
                    >×</button>
                  </span>
                );
              })}
            </div>
          )}
          <AccountPicker
            accounts={(accounts || []).filter(function (a) { return accountIds.indexOf(a.id) === -1; })}
            value=""
            onChange={function (id) { addAccount(id); }}
            placeholder={accountIds.length > 0 ? "Search to add another…" : "Search accounts…"}
          />
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 9.5, color: C.textMuted, marginTop: 4, letterSpacing: "0.04em" }}>
            The loose-ends sweep calls these out first — highest stakes to walk in prepared on.
          </div>
        </div>

        <div>
          <FL>Notes (optional)</FL>
          <TextArea value={notes} onChange={function (e) { setNotes(e.target.value); }} rows={2} placeholder="Anything else worth remembering" />
        </div>

        {!editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.rule, background: C.surface }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, cursor: "pointer", fontFamily: INTER }}>
              <input type="checkbox" checked={createAway} onChange={function (e) { setCreateAway(e.target.checked); }} />
              Set these dates as time away (suppresses false alarms + gives you a "while you were out" catch-up)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, cursor: "pointer", fontFamily: INTER }}>
              <input type="checkbox" checked={createProject} onChange={function (e) { setCreateProject(e.target.checked); }} />
              Track presentation prep as a Gauge project
            </label>
          </div>
        )}

        <button
          onClick={save}
          disabled={!name.trim() || !start || !end || saving}
          style={{
            alignSelf: "flex-start",
            background: (name.trim() && start && end && !saving) ? C.accentDeep : C.accentFaint,
            border: "none", borderRadius: 8, padding: "9px 18px",
            fontSize: 13, fontWeight: 700,
            color: (name.trim() && start && end && !saving) ? C.onAccent : C.textMuted,
            fontFamily: INTER, cursor: (name.trim() && start && end && !saving) ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : (editing ? "Save changes" : "Add conference")}
        </button>
      </div>
    </Modal>
  );
}
