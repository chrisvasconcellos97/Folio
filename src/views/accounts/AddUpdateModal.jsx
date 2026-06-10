import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { ChipDropdown } from "../../components/ChipDropdown";
import { PersonPicker } from "../../components/PersonPicker";
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

export function AddUpdateModal({ orgMembers, contacts, existing, onSave, onClose }) {
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
          <FL>Owner</FL>
          <PersonPicker
            value={owner || null}
            onChange={function(v) { setOwner(v || ""); }}
            members={orgMembers}
            contacts={contacts || []}
            noneLabel="— No owner —"
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
