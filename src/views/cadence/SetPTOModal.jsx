import { useState } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { showToast } from "../../components/Toast";
import { awayLabel } from "../../lib/awayMode";

var INTER = "'Inter', system-ui, sans-serif";

// Set PTO (#50) — declare a date range you're out. Pip uses it to keep silence
// over that window from reading as "you dropped the ball", to excuse commitments
// that came due while away from your score, and to drive the return catch-up.
export function SetPTOModal({ periods, onAdd, onRemove, onClose }) {
  var [start, setStart] = useState("");
  var [end, setEnd]     = useState("");
  var [note, setNote]   = useState("");
  var [saving, setSaving] = useState(false);

  function save() {
    if (!start || !end || saving) return;
    if (end < start) { showToast("End date can't be before the start", "error"); return; }
    setSaving(true);
    Promise.resolve(onAdd({ start_date: start, end_date: end, note: note.trim() || null })).then(function (r) {
      setSaving(false);
      if (r && r.error) { showToast("Couldn't save PTO — run the away-periods migration?", "error"); return; }
      setStart(""); setEnd(""); setNote("");
      showToast("PTO set — Pip's got it ✦");
    }).catch(function () { setSaving(false); showToast("Couldn't save PTO", "error"); });
  }

  var sorted = (periods || []).slice().sort(function (a, b) { return (b.start_date || "").localeCompare(a.start_date || ""); });

  return (
    <Modal title="Set PTO" onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
          Tell Pip when you're out. Over those days it won't flag the quiet as dropped
          balls, and commitments that come due while you're away won't count against
          your "promises kept" score. When you're back, paste your catch-up summary and
          Pip files it under "While you were out."
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FL>First day out</FL>
            <InputField type="date" value={start} onChange={function (e) { setStart(e.target.value); }} />
          </div>
          <div style={{ flex: 1 }}>
            <FL>Last day out</FL>
            <InputField type="date" value={end} onChange={function (e) { setEnd(e.target.value); }} />
          </div>
        </div>
        <div>
          <FL>Note (optional)</FL>
          <InputField value={note} onChange={function (e) { setNote(e.target.value); }} placeholder="e.g. family vacation" />
        </div>

        <button
          onClick={save}
          disabled={!start || !end || saving}
          style={{
            alignSelf: "flex-start",
            background: start && end && !saving ? C.accentDeep : C.accentFaint,
            border: "none", borderRadius: 8, padding: "9px 18px",
            fontSize: 13, fontWeight: 700,
            color: start && end && !saving ? "#fff" : C.textMuted,
            fontFamily: INTER, cursor: start && end && !saving ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Set PTO"}
        </button>

        {sorted.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <FL>Scheduled time off</FL>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {sorted.map(function (p) {
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "8px 11px", borderRadius: 8, border: "1px solid " + C.rule, background: C.surface,
                  }}>
                    <div style={{ fontSize: 13, color: C.text }}>
                      {awayLabel(p)}{p.note ? <span style={{ color: C.textMuted }}> · {p.note}</span> : null}
                    </div>
                    <button
                      onClick={function () { onRemove(p.id); }}
                      aria-label="Remove PTO"
                      style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
