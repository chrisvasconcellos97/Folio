import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { TextArea, InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

var STATUS_OPTIONS = [
  { value: "yellow", label: "Watching",  color: C.yellow, desc: "Needs attention — something is off" },
  { value: "red",    label: "At Risk",   color: C.red,    desc: "Actively at risk — escalate" },
];

export function AccountHealthOverrideModal({ account, onSave, onClose }) {
  var [status, setStatus] = useState(account.status_override || "yellow");
  var [reason, setReason] = useState(account.status_override_reason || "");
  var [until, setUntil]   = useState(account.status_override_until || "");
  var [saving, setSaving] = useState(false);
  var [error, setError]   = useState(null);

  function handleSave() {
    if (!reason.trim()) {
      setError("Reason is required — tell Pip what's going on.");
      return;
    }
    setSaving(true);
    setError(null);
    onSave({
      status_override:        status,
      status_override_reason: reason.trim(),
      status_override_at:     new Date().toISOString(),
      status_override_until:  until || null,
    })
      .then(function () { setSaving(false); onClose(); })
      .catch(function (e) { setSaving(false); setError(e.message || "Couldn't save override"); });
  }

  function handleClear() {
    setSaving(true);
    setError(null);
    onSave({
      status_override:        null,
      status_override_reason: null,
      status_override_at:     null,
      status_override_until:  null,
    })
      .then(function () { setSaving(false); onClose(); })
      .catch(function (e) { setSaving(false); setError(e.message || "Couldn't clear override"); });
  }

  return (
    <Modal title={"Mark " + account.name + "'s health"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Status picker */}
        <div>
          <FL>Status</FL>
          <div style={{ display: "flex", gap: 8 }}>
            {STATUS_OPTIONS.map(function (opt) {
              var on = status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={function () { setStatus(opt.value); }}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid " + (on ? opt.color : C.rule),
                    background: on ? "rgba(0,0,0,0.0)" : "var(--c-input-fill)",
                    cursor: "pointer",
                    transition: "border-color 0.12s",
                    outline: on ? "1px solid " + opt.color : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: opt.color, display: "inline-block",
                    }} />
                    <span style={{
                      fontFamily: MONO, fontSize: 11, fontWeight: on ? 700 : 400,
                      color: on ? opt.color : C.textSoft,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {opt.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reason */}
        <div>
          <FL htmlFor="health-reason">What's going on? <span style={{ fontWeight: 400, color: C.textMuted }}>(required)</span></FL>
          <TextArea
            id="health-reason"
            value={reason}
            onChange={function (e) { setReason(e.target.value); }}
            placeholder="Pip will remember. Contract renewal stalled, key contact left, pricing dispute, etc."
            rows={3}
          />
        </div>

        {/* Until date */}
        <div>
          <FL htmlFor="health-until">Override expires <span style={{ fontWeight: 400, color: C.textMuted }}>(optional — clears automatically)</span></FL>
          <InputField
            id="health-until"
            type="date"
            value={until}
            onChange={function (e) { setUntil(e.target.value); }}
          />
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
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Pin health"}
          </AmberBtn>
          {account.status_override && (
            <SecBtn onClick={handleClear} disabled={saving} style={{ color: C.textMuted }}>
              Clear pin
            </SecBtn>
          )}
          <SecBtn onClick={onClose} disabled={saving}>
            Cancel
          </SecBtn>
        </div>

        {account.status_override && (
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: MONO, letterSpacing: "0.04em" }}>
            Currently pinned: {account.status_override} — "{account.status_override_reason}"
          </div>
        )}
      </div>
    </Modal>
  );
}
