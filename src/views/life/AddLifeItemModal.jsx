import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Heuristic: the obvious high-stakes events Pip should treat as VIP without
// being asked (the user can still toggle it off).
function looksVip(title) {
  var t = (title || "").toLowerCase();
  return /anniversary|birthday|christmas|valentine|mother'?s day|father'?s day|wedding/.test(t);
}

var KINDS = [
  { id: "todo",        label: "Honey-do" },
  { id: "appointment", label: "Appointment" },
  { id: "event",       label: "Event / Birthday" },
];

function Label(props) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
      {props.children}
    </div>
  );
}

// Quick-add for a personal Life item. One modal handles all three kinds; the
// fields shown adapt to the kind. Pip auto-flags obvious VIP events.
export function AddLifeItemModal({ initialKind, onSave, onClose }) {
  var [kind, setKind]             = useState(initialKind || "todo");
  var [title, setTitle]           = useState("");
  var [date, setDate]             = useState("");
  var [time, setTime]             = useState("");
  var [location, setLocation]     = useState("");
  var [notes, setNotes]           = useState("");
  var [complexity, setComplexity] = useState("medium");
  var [importance, setImportance] = useState("normal");
  var [recurring, setRecurring]   = useState(false);
  var [saving, setSaving]         = useState(false);
  // Has the user manually touched the VIP toggle? If not, infer from the title.
  var [vipTouched, setVipTouched] = useState(false);

  var isEvent = kind === "event";
  var isAppt  = kind === "appointment";
  var isTodo  = kind === "todo";
  var effImportance = vipTouched ? importance : (isEvent && looksVip(title) ? "vip" : importance);

  function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    var payload = {
      kind: kind,
      title: title.trim(),
      notes: notes.trim() || null,
      item_date: (isEvent || isAppt) && date ? date : null,
      item_time: isAppt && time ? time : null,
      location: isAppt && location.trim() ? location.trim() : null,
      importance: isEvent ? effImportance : "normal",
      recurrence: isEvent && recurring ? "annual" : "none",
      complexity: isTodo ? complexity : null,
      status: "open",
      opened_at: new Date().toISOString(),
    };
    Promise.resolve(onSave(payload)).then(function () {
      setSaving(false);
      onClose();
    }).catch(function () { setSaving(false); });
  }

  return (
    <Modal title="Add to Life" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Kind picker */}
        <div>
          <Label>What is it?</Label>
          <div style={{ display: "flex", gap: 6 }}>
            {KINDS.map(function (k) {
              var active = kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={function () { setKind(k.id); }}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer",
                    fontFamily: INTER, fontSize: 12.5, fontWeight: 600,
                    color: active ? C.bg : C.textSoft,
                    background: active ? C.accent : "transparent",
                    border: "1px solid " + (active ? C.accent : C.rule),
                  }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>{isTodo ? "What needs doing?" : "Title"}</Label>
          <InputField
            value={title}
            onChange={setTitle}
            autoFocus
            placeholder={isTodo ? "Rebuild the back gate" : isEvent ? "Sarah's birthday" : "Dentist — cleaning"}
          />
        </div>

        {(isEvent || isAppt) && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>{isEvent ? "Date" : "When"}</Label>
              <InputField type="date" value={date} onChange={setDate} />
            </div>
            {isAppt && (
              <div style={{ flex: 1 }}>
                <Label>Time</Label>
                <InputField type="time" value={time} onChange={setTime} />
              </div>
            )}
          </div>
        )}

        {isAppt && (
          <div>
            <Label>Location (optional)</Label>
            <InputField value={location} onChange={setLocation} placeholder="123 Main St" />
          </div>
        )}

        {isTodo && (
          <div>
            <Label>How big a job?</Label>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "big", label: "Big project" }].map(function (c) {
                var active = complexity === c.id;
                return (
                  <button key={c.id} type="button" onClick={function () { setComplexity(c.id); }}
                    style={{
                      flex: 1, padding: "7px 6px", borderRadius: 8, cursor: "pointer",
                      fontFamily: INTER, fontSize: 12, fontWeight: 600,
                      color: active ? C.bg : C.textSoft,
                      background: active ? C.accent : "transparent",
                      border: "1px solid " + (active ? C.accent : C.rule),
                    }}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isEvent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={recurring} onChange={function (e) { setRecurring(e.target.checked); }} style={{ accentColor: C.accent, width: 16, height: 16 }} />
              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft }}>Repeats every year</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={effImportance === "vip"}
                onChange={function (e) { setVipTouched(true); setImportance(e.target.checked ? "vip" : "normal"); }}
                style={{ accentColor: C.accent, width: 16, height: 16 }}
              />
              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft }}>
                Important — give me lots of heads up
                {!vipTouched && effImportance === "vip" && <span style={{ color: C.accent }}> · Pip flagged this</span>}
              </span>
            </label>
          </div>
        )}

        <div>
          <Label>Notes (optional)</Label>
          <TextArea value={notes} onChange={setNotes} rows={2} placeholder={isTodo ? "What's involved, what you'll need…" : "Anything to remember"} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontFamily: INTER, fontSize: 13, cursor: "pointer", padding: "8px 6px" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim() || saving}
            onClick={handleSave}
            style={{
              background: C.accentDeep, border: "1px solid " + C.accent, borderRadius: 8,
              padding: "8px 18px", color: C.bg, fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: title.trim() && !saving ? "pointer" : "not-allowed",
              opacity: title.trim() && !saving ? 1 : 0.5,
            }}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
