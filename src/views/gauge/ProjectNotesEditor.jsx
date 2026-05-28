import { useState, useEffect, useRef } from "react";
import { C } from "../../lib/colors";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

export function ProjectNotesEditor({ project, onUpdate, compact }) {
  var [open, setOpen] = useState(Boolean(project.notes));
  var [notes, setNotes] = useState(project.notes || "");
  var [savedAt, setSavedAt] = useState(null);
  var saveTimer = useRef(null);

  useEffect(function () {
    setNotes(project.notes || "");
  }, [project.id]);

  useEffect(function () {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (notes === (project.notes || "")) return;
    saveTimer.current = setTimeout(function () {
      onUpdate(project.id, { notes: notes })
        .then(function () { setSavedAt(Date.now()); })
        .catch(function () {});
    }, 1500);
    return function () { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  var hasNotes = Boolean((project.notes || "").trim());

  if (!open) {
    return (
      <button
        onClick={function () { setOpen(true); }}
        style={{
          background: "transparent",
          border: "1px dashed " + C.rule,
          borderRadius: 8,
          padding: compact ? "6px 10px" : "8px 12px",
          color: C.textMuted,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{hasNotes ? "✎" : "+"}</span>
        <span>{hasNotes ? "Notes" : "Add notes"}</span>
      </button>
    );
  }

  return (
    <div style={{ marginTop: compact ? 8 : 12, marginBottom: compact ? 8 : 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 6,
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Notes
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: C.textMuted,
          letterSpacing: "0.06em",
        }}>
          {savedAt ? "Saved" : "Autosaves"}
        </div>
      </div>
      <textarea
        value={notes}
        onChange={function (e) { setNotes(e.target.value); }}
        placeholder="Jot anything you want to remember about this project — discussions, decisions, blockers."
        rows={compact ? 3 : 5}
        style={{
          width: "100%",
          background: C.surface2,
          border: "1px solid " + C.rule,
          borderRadius: 8,
          padding: "10px 12px",
          color: C.text,
          fontSize: 13,
          lineHeight: 1.55,
          fontFamily: INTER,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
