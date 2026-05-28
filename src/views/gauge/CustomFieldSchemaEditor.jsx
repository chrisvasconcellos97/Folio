import { useState } from "react";
import { C } from "../../lib/colors";
import { FIELD_TYPES, keyFromLabel } from "../../lib/gaugeFields";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// Edits a project's `custom_field_schema` array. Each row is one column
// definition: { key, label, type, options?, builtin? }. Built-in "bones"
// fields are tagged so removing them is still possible but flagged.
export function CustomFieldSchemaEditor({ schema, onChange }) {
  var [draftLabel, setDraftLabel] = useState("");
  var [draftType,  setDraftType]  = useState("text");

  function update(idx, patch) {
    var next = (schema || []).map(function (f, i) {
      return i === idx ? Object.assign({}, f, patch) : f;
    });
    onChange(next);
  }

  function remove(idx) {
    onChange((schema || []).filter(function (_, i) { return i !== idx; }));
  }

  function move(idx, dir) {
    var arr = (schema || []).slice();
    var swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    var tmp = arr[idx]; arr[idx] = arr[swap]; arr[swap] = tmp;
    onChange(arr);
  }

  function addField() {
    var label = draftLabel.trim();
    if (!label) return;
    var key = keyFromLabel(label);
    // Ensure unique key.
    var existing = (schema || []).map(function (f) { return f.key; });
    var finalKey = key, n = 2;
    while (existing.indexOf(finalKey) !== -1) { finalKey = key + "_" + n++; }
    var next = (schema || []).concat([{
      key:   finalKey,
      label: label,
      type:  draftType,
      options: draftType === "dropdown" ? [] : undefined,
    }]);
    onChange(next);
    setDraftLabel("");
    setDraftType("text");
  }

  function setOptions(idx, csv) {
    var opts = csv.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    update(idx, { options: opts });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(schema || []).map(function (f, i) {
        return (
          <div
            key={f.key + i}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr 120px 1fr auto",
              gap: 8,
              alignItems: "center",
              background: C.surface2,
              border: "1px solid " + C.rule,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button
                onClick={function () { move(i, -1); }}
                disabled={i === 0}
                title="Move up"
                style={{
                  background: "none", border: "none", color: C.textMuted,
                  cursor: i === 0 ? "default" : "pointer",
                  fontFamily: MONO, fontSize: 9, padding: 0, lineHeight: 1,
                  opacity: i === 0 ? 0.3 : 1,
                }}
              >▲</button>
              <button
                onClick={function () { move(i, 1); }}
                disabled={i === (schema.length - 1)}
                title="Move down"
                style={{
                  background: "none", border: "none", color: C.textMuted,
                  cursor: i === (schema.length - 1) ? "default" : "pointer",
                  fontFamily: MONO, fontSize: 9, padding: 0, lineHeight: 1,
                  opacity: i === (schema.length - 1) ? 0.3 : 1,
                }}
              >▼</button>
            </div>
            <input
              value={f.label}
              onChange={function (e) { update(i, { label: e.target.value }); }}
              placeholder="Column label"
              style={{
                background: "transparent", border: "none", outline: "none",
                fontSize: 12, color: C.text, fontFamily: INTER,
              }}
            />
            <select
              value={f.type}
              onChange={function (e) {
                var t = e.target.value;
                update(i, { type: t, options: t === "dropdown" ? (f.options || []) : undefined });
              }}
              style={{
                background: C.bgDark, border: "1px solid " + C.rule, borderRadius: 4,
                padding: "3px 6px", fontSize: 11, color: C.text, fontFamily: MONO,
              }}
            >
              {FIELD_TYPES.map(function (t) {
                return <option key={t.id} value={t.id}>{t.label}</option>;
              })}
            </select>
            <div>
              {f.type === "dropdown" && (
                <input
                  value={(f.options || []).join(", ")}
                  onChange={function (e) { setOptions(i, e.target.value); }}
                  placeholder="Option 1, Option 2, …"
                  style={{
                    width: "100%", background: C.bgDark, border: "1px solid " + C.rule,
                    borderRadius: 4, padding: "3px 6px", fontSize: 11, color: C.text,
                    fontFamily: INTER, outline: "none", boxSizing: "border-box",
                  }}
                />
              )}
              {f.builtin && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  default
                </span>
              )}
            </div>
            <button
              onClick={function () { remove(i); }}
              title="Remove column"
              style={{
                background: "none", border: "none", color: C.textMuted,
                cursor: "pointer", fontSize: 14, padding: "2px 4px",
              }}
            >×</button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <input
          value={draftLabel}
          onChange={function (e) { setDraftLabel(e.target.value); }}
          onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addField(); } }}
          placeholder="+ New column label"
          style={{
            flex: 1, background: C.surface, border: "1px solid " + C.rule,
            borderRadius: 6, padding: "6px 8px",
            fontSize: 12, color: C.text, fontFamily: INTER, outline: "none",
          }}
        />
        <select
          value={draftType}
          onChange={function (e) { setDraftType(e.target.value); }}
          style={{
            background: C.bgDark, border: "1px solid " + C.rule, borderRadius: 6,
            padding: "5px 8px", fontSize: 11, color: C.text, fontFamily: MONO,
          }}
        >
          {FIELD_TYPES.map(function (t) { return <option key={t.id} value={t.id}>{t.label}</option>; })}
        </select>
        {draftLabel.trim() && (
          <button
            onClick={addField}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              color: C.accent, borderRadius: 6, padding: "6px 12px",
              fontFamily: MONO, fontSize: 11, cursor: "pointer",
            }}
          >Add</button>
        )}
      </div>
    </div>
  );
}
