import { useState, useRef } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { ChipDropdown } from "../../components/ChipDropdown";
import {
  UPDATE_TYPES, UPDATE_TYPE_LABELS,
  IMPACT_OPTIONS, IMPACT_LABELS,
} from "../../lib/accountUpdateTypes";

function todayIso() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

// Hybrid owner input — text input + small typeahead listing org members.
// Stored value is the final string only (no FK), so a free-text "Dev" or
// "Supplier X" stays valid alongside a member-name pick.
function OwnerInput({ value, onChange, members }) {
  var [open, setOpen] = useState(false);
  var inputRef = useRef(null);

  var memberOptions = (members || [])
    .map(function (m) {
      var name  = m.display_name || m.full_name || m.name || m.email || "";
      var email = m.email || "";
      return { name: name, email: email };
    })
    .filter(function (m) { return m.name; });

  var lower = (value || "").trim().toLowerCase();
  var filtered = lower
    ? memberOptions.filter(function (m) {
        return m.name.toLowerCase().indexOf(lower) !== -1
            || (m.email && m.email.toLowerCase().indexOf(lower) !== -1);
      })
    : memberOptions;

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        id="update-owner"
        type="text"
        value={value}
        onChange={function (e) { onChange(e.target.value); setOpen(true); }}
        onFocus={function () { setOpen(true); }}
        onBlur={function () { setTimeout(function () { setOpen(false); }, 120); }}
        placeholder="Who did this? (e.g. Dev, Supplier X, or a teammate)"
        style={{
          width: "100%",
          background: C.bgDark,
          border: "1px solid " + C.border,
          borderRadius: 10,
          padding: "10px 14px",
          color: C.text,
          fontSize: 16,
          fontFamily: "'Inter', system-ui, sans-serif",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: C.bgDropdown,
            border: "1px solid " + C.border,
            borderRadius: 10,
            padding: 4,
            zIndex: 100,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filtered.slice(0, 8).map(function (m, i) {
            return (
              <button
                key={i}
                type="button"
                onMouseDown={function (e) {
                  // Prevent input's onBlur from closing the menu before click fires
                  e.preventDefault();
                }}
                onClick={function () {
                  onChange(m.name);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: C.text,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13,
                }}
              >
                <span style={{ color: C.text }}>{m.name}</span>
                {m.email && (
                  <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 6 }}>{m.email}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AddUpdateModal({ orgMembers, existing, onSave, onClose }) {
  var isEdit = !!existing;
  var [title, setTitle]               = useState(existing ? existing.title || "" : "");
  var [updateDate, setUpdateDate]     = useState(existing ? existing.update_date || todayIso() : todayIso());
  var [updateType, setUpdateType]     = useState(existing ? existing.update_type || null : null);
  var [owner, setOwner]               = useState(existing ? existing.owner || "" : "");
  var [impact, setImpact]             = useState(existing ? existing.observed_impact || null : null);
  var [description, setDescription]   = useState(existing ? existing.description || "" : "");
  var [loading, setLoading]           = useState(false);
  var [error, setError]               = useState(null);

  function handleSave() {
    if (!title.trim())     { setError("Title is required.");          return; }
    if (!updateDate)       { setError("Date is required.");           return; }
    if (!updateType)       { setError("Pick a type.");                return; }
    setLoading(true);
    setError(null);
    onSave({
      title:           title.trim(),
      update_date:     updateDate,
      update_type:     updateType,
      owner:           owner.trim()       || null,
      observed_impact: impact             || null,
      description:     description.trim() || null,
    })
      .then(function () {
        setLoading(false);
        onClose();
      })
      .catch(function (err) {
        setLoading(false);
        setError(err.message || "Couldn't save — check your connection");
      });
  }

  return (
    <Modal title={isEdit ? "Edit Update" : "Log Update"} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL htmlFor="update-title">Title</FL>
          <InputField
            id="update-title"
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. Catalog refresh pushed live"
            autoFocus
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FL htmlFor="update-date">Date</FL>
            <InputField
              id="update-date"
              type="date"
              value={updateDate}
              onChange={function (e) { setUpdateDate(e.target.value); }}
            />
          </div>
          <div>
            <FL>Type</FL>
            <ChipDropdown
              label="Pick a type"
              options={UPDATE_TYPES.map(function (t) { return UPDATE_TYPE_LABELS[t]; })}
              value={updateType ? UPDATE_TYPE_LABELS[updateType] : null}
              onSelect={function (lbl) {
                var found = UPDATE_TYPES.find(function (t) { return UPDATE_TYPE_LABELS[t] === lbl; });
                setUpdateType(found || null);
              }}
            />
          </div>
        </div>

        <div>
          <FL htmlFor="update-owner">Owner</FL>
          <OwnerInput
            value={owner}
            onChange={setOwner}
            members={orgMembers}
          />
        </div>

        <div>
          <FL>Impact (optional)</FL>
          <ChipDropdown
            label="If known"
            options={IMPACT_OPTIONS.map(function (i) { return IMPACT_LABELS[i]; })}
            value={impact ? IMPACT_LABELS[impact] : null}
            onSelect={function (lbl) {
              var found = IMPACT_OPTIONS.find(function (i) { return IMPACT_LABELS[i] === lbl; });
              setImpact(found || null);
            }}
          />
        </div>

        <div>
          <FL htmlFor="update-desc">Description</FL>
          <TextArea
            id="update-desc"
            value={description}
            onChange={function (e) { setDescription(e.target.value); }}
            placeholder="What changed and why it might move the numbers?"
            rows={3}
          />
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: C.redFaint,
              border: "1px solid " + C.redLine,
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
            {loading ? "Saving..." : (isEdit ? "Save changes" : "Log Update")}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </SecBtn>
        </div>
      </div>
    </Modal>
  );
}
