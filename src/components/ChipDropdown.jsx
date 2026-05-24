import { useState } from "react";
import { C } from "../lib/colors";

export function ChipDropdown({ label, options, value, values, onSelect, multi, placeholder }) {
  var [open, setOpen] = useState(false);
  var selected = multi ? (values || []) : value;

  function isSelected(opt) {
    return multi ? selected.includes(opt) : selected === opt;
  }

  function handleSelect(opt) {
    onSelect(opt);
    if (!multi) setOpen(false);
  }

  var displayLabel = multi
    ? (selected.length > 0 ? selected.join(", ") : (placeholder || label))
    : (selected || placeholder || label);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13,
          color: (multi ? selected.length > 0 : !!selected) ? C.text : C.textMuted,
          fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayLabel}
        </span>
        <span style={{ opacity: 0.5, fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div
            onClick={function () { setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: C.bgDropdown,
            border: "1px solid " + C.border,
            borderRadius: 10,
            padding: 6,
            zIndex: 100,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            maxHeight: 200,
            overflowY: "auto",
          }}>
            {options.map(function (opt) {
              var sel = isSelected(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={function () { handleSelect(opt); }}
                  style={{
                    background: sel ? "rgba(74,155,130,0.2)" : "rgba(74,155,130,0.06)",
                    border: "1px solid " + (sel ? "rgba(74,155,130,0.4)" : "rgba(74,155,130,0.15)"),
                    borderRadius: 20,
                    padding: "4px 12px",
                    fontSize: 12,
                    color: sel ? C.accent : C.textSub,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    fontWeight: sel ? 600 : 400,
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
