import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { detectRegion, detectMarketScope } from "../../lib/regions";

var TIERS    = ["Major", "Mid", "Growth"];
var STATUSES = [
  { value: "green",  label: "Healthy" },
  { value: "yellow", label: "Watch"   },
  { value: "red",    label: "At Risk" },
];
var PRESET_TAGS = ["Aftermarket", "Salvage", "OE", "Reman"];

function TagChip({ label, active, onClick, onRemove, color }) {
  var col = color || C.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(103,200,249,0.15)" : "rgba(103,200,249,0.04)",
        color: active ? col : C.textMuted,
        border: "1px solid " + (active ? "rgba(103,200,249,0.35)" : C.border),
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {onRemove && (
        <span
          onClick={function (e) { e.stopPropagation(); onRemove(); }}
          style={{ fontSize: 12, color: C.textMuted, lineHeight: 1 }}
        >
          ×
        </span>
      )}
    </button>
  );
}

export function AddAccountModal({ userId, onSave, onClose, existing }) {
  var [name, setName]       = useState(existing ? existing.name : "");
  var [revenue, setRevenue] = useState(existing ? (existing.revenue || "") : "");
  var [tier, setTier]       = useState(existing ? (existing.tier || "Mid") : "Mid");
  var [status, setStatus]   = useState(existing ? (existing.status || "green") : "green");
  var [notes, setNotes]     = useState(existing ? (existing.objective || "") : "");
  var [tags, setTags]       = useState(existing ? (existing.tags || []) : []);
  var [customTag, setCustomTag] = useState("");
  var [states, setStates]   = useState(existing ? (existing.serviced_states || []) : []);
  var [stateInput, setStateInput] = useState("");
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var region      = detectRegion(states);
  var marketScope = detectMarketScope(states);

  function toggleTag(t) {
    setTags(function (prev) {
      return prev.includes(t) ? prev.filter(function (x) { return x !== t; }) : prev.concat([t]);
    });
  }

  function addCustomTag() {
    var val = customTag.trim();
    if (val && !tags.includes(val)) setTags(function (prev) { return prev.concat([val]); });
    setCustomTag("");
  }

  function handleCustomTagKey(e) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCustomTag(); }
  }

  function handleStateKey(e) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      var val = stateInput.trim().toUpperCase().replace(/,/g, "");
      if (val && !states.includes(val)) setStates(function (prev) { return prev.concat([val]); });
      setStateInput("");
    }
  }

  function removeState(s) {
    setStates(function (prev) { return prev.filter(function (x) { return x !== s; }); });
  }

  function handleSave() {
    if (!name.trim()) { setError("Account name is required."); return; }
    setLoading(true);
    setError(null);
    onSave({
      name:            name.trim(),
      revenue:         revenue.trim() || null,
      tier:            tier,
      status:          status,
      objective:       notes.trim() || null,
      tags:            tags.length > 0 ? tags : null,
      serviced_states: states.length > 0 ? states : null,
      region:          region || null,
      market_scope:    marketScope || null,
    })
      .then(function () { setLoading(false); onClose(); })
      .catch(function (err) { setLoading(false); setError(err.message); });
  }

  return (
    <Modal title={existing ? "Edit Account" : "Add Account"} onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Name */}
        <div>
          <FL>Account Name</FL>
          <InputField value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Company name" />
        </div>

        {/* Revenue */}
        <div>
          <FL>Revenue (YTD)</FL>
          <InputField value={revenue} onChange={function (e) { setRevenue(e.target.value); }} placeholder="e.g. $4.9M" />
        </div>

        {/* Tier + Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FL>Tier</FL>
            <SelectField value={tier} onChange={function (e) { setTier(e.target.value); }}>
              {TIERS.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
            </SelectField>
          </div>
          <div>
            <FL>Status</FL>
            <SelectField value={status} onChange={function (e) { setStatus(e.target.value); }}>
              {STATUSES.map(function (s) { return <option key={s.value} value={s.value}>{s.label}</option>; })}
            </SelectField>
          </div>
        </div>

        {/* Supplier types */}
        <div>
          <FL>Supplier Type</FL>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {PRESET_TAGS.map(function (t) {
              return (
                <TagChip
                  key={t}
                  label={t}
                  active={tags.includes(t)}
                  onClick={function () { toggleTag(t); }}
                />
              );
            })}
          </div>
          {/* Custom tag input */}
          <div style={{ display: "flex", gap: 6 }}>
            <InputField
              value={customTag}
              onChange={function (e) { setCustomTag(e.target.value); }}
              onKeyDown={handleCustomTagKey}
              placeholder="Custom type, Enter to add"
              style={{ flex: 1 }}
            />
          </div>
          {/* Custom tags */}
          {tags.filter(function (t) { return !PRESET_TAGS.includes(t); }).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {tags.filter(function (t) { return !PRESET_TAGS.includes(t); }).map(function (t) {
                return (
                  <TagChip
                    key={t}
                    label={t}
                    active
                    onRemove={function () { toggleTag(t); }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Serviced states */}
        <div>
          <FL>Serviced States</FL>
          {/* Chips */}
          {states.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
              {states.map(function (s) {
                return (
                  <span
                    key={s}
                    style={{
                      background: "rgba(124,92,191,0.12)",
                      color: C.purple,
                      border: "1px solid rgba(124,92,191,0.25)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {s}
                    <span
                      onClick={function () { removeState(s); }}
                      style={{ cursor: "pointer", color: C.textMuted, fontSize: 13, lineHeight: 1 }}
                    >
                      ×
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          <InputField
            value={stateInput}
            onChange={function (e) { setStateInput(e.target.value.toUpperCase()); }}
            onKeyDown={handleStateKey}
            placeholder="Type state code + Enter (FL, GA, TN...)"
          />
          {/* Auto-detected region */}
          {region && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>Auto-detected:</span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.accent,
                textShadow: "0 0 8px " + C.accent,
              }}>
                {region}
              </span>
              {marketScope && (
                <span style={{ fontSize: 10, color: C.textMuted }}>· {marketScope}</span>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
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
          <div style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: C.red,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : (existing ? "Save Changes" : "Add Account")}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>
      </div>
    </Modal>
  );
}
