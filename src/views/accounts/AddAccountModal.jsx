import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

var TIERS    = ["Major", "Mid", "Growth"];
var STATUSES = [
  { value: "green",  label: "Healthy" },
  { value: "yellow", label: "Watch" },
  { value: "red",    label: "At Risk" },
];

export function AddAccountModal({ userId, onSave, onClose, existing }) {
  var [name, setName]          = useState(existing ? existing.name : "");
  var [revenue, setRevenue]    = useState(existing ? (existing.revenue || "") : "");
  var [tier, setTier]          = useState(existing ? (existing.tier || "Mid") : "Mid");
  var [status, setStatus]      = useState(existing ? (existing.status || "green") : "green");
  var [notes, setNotes]        = useState(existing ? (existing.objective || "") : "");
  var [loading, setLoading]    = useState(false);
  var [error, setError]        = useState(null);

  function handleSave() {
    if (!name.trim()) { setError("Account name is required."); return; }
    setLoading(true);
    setError(null);
    var data = {
      name:         name.trim(),
      revenue:      revenue.trim() || null,
      tier:         tier,
      status:       status,
      objective:    notes.trim() || null,
    };
    onSave(data)
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
    <Modal
      title={existing ? "Edit Account" : "Add Account"}
      onClose={onClose}
      width={480}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL>Account Name</FL>
          <InputField
            value={name}
            onChange={function (e) { setName(e.target.value); }}
            placeholder="Company name"
          />
        </div>

        <div>
          <FL>Revenue (YTD)</FL>
          <InputField
            value={revenue}
            onChange={function (e) { setRevenue(e.target.value); }}
            placeholder="e.g. $4.9M"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FL>Tier</FL>
            <SelectField
              value={tier}
              onChange={function (e) { setTier(e.target.value); }}
            >
              {TIERS.map(function (t) {
                return (
                  <option key={t} value={t}>{t}</option>
                );
              })}
            </SelectField>
          </div>

          <div>
            <FL>Status</FL>
            <SelectField
              value={status}
              onChange={function (e) { setStatus(e.target.value); }}
            >
              {STATUSES.map(function (s) {
                return (
                  <option key={s.value} value={s.value}>{s.label}</option>
                );
              })}
            </SelectField>
          </div>
        </div>

        <div>
          <FL>Notes</FL>
          <TextArea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Who they are, what they sell, any context worth knowing..."
            rows={2}
          />
        </div>

        {error && (
          <div
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

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : (existing ? "Save Changes" : "Add Account")}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
