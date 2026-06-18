import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { fmtShort } from "../../lib/dateUtils";
import { useEntityDetection } from "../../hooks/useEntityDetection";
import { EntitySuggestionChip } from "../../components/EntitySuggestionChip";

// Presentational layer for PipSummarizePreview. This file holds the pure
// helpers + the stateless/leaf sub-components (people chips, checkbox, inputs,
// account chip, source expander, unknown-person row). The orchestration /
// state container lives in PipSummarizePreview.jsx and composes these.
//
// Extracted mechanically (Batch 8) — zero behavior change.

export var INTER = "'Inter', system-ui, sans-serif";
export var MONO  = "'JetBrains Mono', ui-monospace, monospace";

export function fmtDate(d) {
  if (!d) return null;
  return fmtShort(d) || d;
}

export function findItem(items, id)        { return (items || []).find(function (i) { return i.id === id; }); }
export function findProject(projects, id)  { return (projects || []).find(function (p) { return p.id === id; }); }
export function findTask(project, taskId)  {
  if (!project || !Array.isArray(project.tasks)) return null;
  return project.tasks.find(function (t) { return t.id === taskId; });
}

// Initial title surfaced in the editable input. update_item rows expose the
// proposed new text (the field about to land), not the existing item's text.
export function initialTitle(row) {
  switch (row.kind) {
    case "new_item":    return row.text || "";
    case "new_task":    return row.title || "";
    case "update_item": return (row.fields && row.fields.text) || "";
    case "update_task": return (row.fields && row.fields.title) || "";
    default:            return "";
  }
}

export function hasEditableTitle(kind) {
  return kind === "new_item" || kind === "new_task" || kind === "update_item" || kind === "update_task";
}

// Short label shown above the editable input. For update rows we leave
// the existing text out of the leader — it gets its own "CURRENT" line in
// the diff block below so the user can read it in full instead of a
// 60-char truncation.
export function rowLeader(row, ctx, effectiveProjectId) {
  switch (row.kind) {
    case "new_item":    return "New item";
    case "new_task": {
      var npId = effectiveProjectId !== undefined ? effectiveProjectId : row.project_id;
      var np = findProject(ctx.activeProjects, npId);
      return np ? ("New task on " + np.title) : "New task (standalone)";
    }
    case "update_item": return "Update item";
    case "update_task": {
      var up = findProject(ctx.activeProjects, row.project_id);
      return "Update task" + (up ? " on " + up.title : "");
    }
    case "close_item": {
      var ci = findItem(ctx.existingItems, row.target_id);
      return "Close " + (ci ? "\"" + (ci.text || "").slice(0, 60) + "\"" : "item") + (row.reason ? " — " + row.reason : "");
    }
    case "skip":
      return "Skip — " + (row.reason || "duplicate");
    default:
      return row.kind;
  }
}

// For update_* rows, look up the existing item / task and return its
// current text so the diff block can render "CURRENT → REPLACE WITH".
export function currentTextForUpdate(row, ctx) {
  if (row.kind === "update_item") {
    var it = findItem(ctx.existingItems, row.target_id);
    return it ? (it.text || "") : "";
  }
  if (row.kind === "update_task") {
    var p = findProject(ctx.activeProjects, row.project_id);
    var t = findTask(p, row.task_id);
    return t ? (t.title || t.text || "") : "";
  }
  return "";
}

export function rowGroup(kind) {
  if (kind === "skip") return "skipped";
  if (kind === "new_item" || kind === "new_task") return "new";
  return "changes";
}

export function hasAssignee(kind) { return kind === "new_item" || kind === "new_task"; }
export function hasDueEdit(kind)  { return kind === "new_item" || kind === "new_task"; }

// Recognizes a person named in a plan row's title and offers to drop them
// into the Assignee or Recipient field — the post-meeting equivalent of the
// old in-meeting chip, surfaced here where tasks are actually chosen.
export function PlanPeopleChip({ title, contacts, onAssignee, onRecipient }) {
  var suggestion = useEntityDetection(title || "", contacts || [], [], []);
  var [dismissed, setDismissed] = useState(false);
  var key = suggestion && suggestion.contact ? (suggestion.contact.id || suggestion.contact.name) : null;
  useEffect(function () { setDismissed(false); }, [key]);
  if (!suggestion || suggestion.type === "account" || dismissed) return null;
  var c = suggestion.contact;
  var val = c.email || c.name || "";
  return (
    <EntitySuggestionChip
      suggestion={suggestion}
      onAcceptAssignee={function () { onAssignee(val); setDismissed(true); }}
      onAcceptRecipient={function () { onRecipient(val); setDismissed(true); }}
      onDismiss={function () { setDismissed(true); }}
    />
  );
}

// Custom checkbox: native input is visually hidden but still wired for a11y.
// The painted box is a 18×18 rounded square — empty = rule border on dark
// fill, checked = accent fill with white check glyph. Hovering brightens
// the border so it's clear the row is interactive.
export function RowCheckbox({ checked, onChange, lowConfidence, ariaLabel }) {
  return (
    <label
      className="pip-row-check"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        cursor: "pointer", flexShrink: 0, userSelect: "none",
      }}
    >
      {lowConfidence && (
        <span
          aria-label="Low confidence — double-check"
          title="Low confidence — double-check"
          style={{
            width: 6, height: 6, borderRadius: 99,
            background: C.yellow, flexShrink: 0,
          }}
        />
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={function (e) { onChange(e.target.checked); }}
        aria-label={ariaLabel || (checked ? "Selected (uncheck to decline)" : "Not selected")}
        style={{
          position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: 5,
          border: "1.5px solid " + (checked ? C.accent : C.textMuted),
          background: checked ? C.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.12s ease, border-color 0.12s ease",
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2L4.8 8.4L9.5 3.4"
              stroke={C.bg}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </label>
  );
}

export function DueInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={function (e) { onChange(e.target.value || null); }}
      style={{
        background: C.surface, color: C.text,
        border: "1px solid " + C.rule, borderRadius: 6,
        padding: "4px 8px", fontSize: 16, fontFamily: INTER,
      }}
    />
  );
}

export function TargetAccountChip({ targetAccountId, currentAccountName, hasNoCurrentAccount, isPersonCadence, rosterOptions, rosterLookup, onChange }) {
  var [open, setOpen] = useState(false);
  var targetName = targetAccountId
    ? ((rosterLookup[targetAccountId] && rosterLookup[targetAccountId].name) || targetAccountId)
    : null;
  var isRouted = !!targetAccountId;
  // For a person/internal 1:1, account-less is the intended default (leadership
  // task) — not a "needs routing" warning.
  var personSelf = isPersonCadence && !isRouted;
  var needsRoute = hasNoCurrentAccount && !isRouted && !isPersonCadence;
  var label = targetName ? ("→ on " + targetName)
    : personSelf ? "↳ My task · no account"
    : needsRoute ? "→ Route to account…"
    : ("→ on " + currentAccountName);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          background: isRouted ? C.accentFaint : (needsRoute ? "rgba(220,160,0,0.08)" : "none"),
          border: "1px solid " + (isRouted ? C.accentLine : (needsRoute ? C.yellow : C.rule)),
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 10,
          color: isRouted ? C.accent : (needsRoute ? C.yellow : C.textMuted),
          cursor: "pointer",
          fontFamily: INTER,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
            background: C.bgDropdown, border: "1px solid " + C.rule,
            borderRadius: 8, padding: "4px 0",
            minWidth: 200, maxWidth: 300,
            boxShadow: "0 4px 16px var(--c-overlay-shadow)",
          }}
        >
          <button
            type="button"
            onClick={function () { onChange(null); setOpen(false); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              background: !targetAccountId ? C.accentFaint : "none",
              border: "none", padding: "6px 12px",
              fontSize: 11, color: hasNoCurrentAccount ? C.textMuted : C.text, cursor: "pointer", fontFamily: INTER,
            }}
          >
            {currentAccountName}{hasNoCurrentAccount ? "" : " (current)"}
          </button>
          {rosterOptions.map(function (a) {
            return (
              <button
                key={a.id}
                type="button"
                onClick={function () { onChange(a.id); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: targetAccountId === a.id ? C.accentFaint : "none",
                  border: "none", padding: "6px 12px",
                  fontSize: 11, color: C.text, cursor: "pointer", fontFamily: INTER,
                }}
              >
                {a.name || a.id}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline editable title input. Uses a textarea so long titles wrap, and
// auto-grows on input by syncing height to scrollHeight.
export function TitleInput({ value, onChange, edited }) {
  function autoSize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  return (
    <textarea
      ref={autoSize}
      value={value}
      onChange={function (e) { onChange(e.target.value); autoSize(e.target); }}
      rows={1}
      aria-label="Row title — edit before applying"
      style={{
        width: "100%",
        background: C.bgDark,
        border: "1px solid " + (edited ? C.accent : C.rule),
        borderRadius: 6,
        padding: "6px 8px",
        color: C.text,
        fontSize: 16,
        fontFamily: INTER,
        lineHeight: 1.45,
        resize: "none",
        outline: "none",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    />
  );
}

export function SourceExpander({ excerpt, onExcerptChange, edited }) {
  var [open, setOpen] = useState(false);
  if (!excerpt && !open) {
    // No excerpt to show — render a muted placeholder so the user knows
    // Pip didn't surface one rather than thinking the link is broken.
    return (
      <button
        type="button"
        onClick={function () { setOpen(true); }}
        style={{
          background: "none", border: "none", padding: 0,
          color: C.textMuted, cursor: "pointer",
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.07em", textTransform: "uppercase",
          alignSelf: "flex-start",
        }}
      >
        ▸ See source
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "stretch" }}>
      <button
        type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          background: "none", border: "none", padding: 0,
          color: open ? C.textSoft : C.textMuted, cursor: "pointer",
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.07em", textTransform: "uppercase",
          alignSelf: "flex-start",
        }}
      >
        {open ? "▾ Source" : "▸ See source"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <textarea
            value={excerpt || ""}
            onChange={function (e) { onExcerptChange(e.target.value); }}
            rows={2}
            placeholder={excerpt ? "" : "Pip didn't quote a source. Edit to teach him what triggered this."}
            aria-label="Source excerpt from notes — edit to correct Pip"
            style={{
              width: "100%",
              background: C.bgDark,
              border: "1px solid " + (edited ? C.accent : C.rule),
              borderRadius: 6,
              padding: "8px 10px",
              color: C.textSoft,
              fontSize: 16,
              fontFamily: INTER,
              lineHeight: 1.5,
              fontStyle: "italic",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              borderLeft: "3px solid " + C.accent,
            }}
          />
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: INTER }}>
            From your notes. Edit the quote to correct Pip's read — saves to learning loop.
          </div>
        </div>
      )}
    </div>
  );
}

export function UnknownPersonRow({ person, onAdd, onDismiss }) {
  var [expanded, setExpanded] = useState(false);
  var [name, setName]   = useState(person.name || "");
  var [role, setRole]   = useState("");
  var [email, setEmail] = useState("");
  var [saving, setSaving] = useState(false);

  function handleSave() {
    if (saving || !name.trim()) return;
    setSaving(true);
    Promise.resolve(onAdd({ name: name.trim(), role: role.trim() || null, email: email.trim() || null }))
      .then(function () { setSaving(false); })
      .catch(function () { setSaving(false); });
  }

  return (
    <div style={{
      padding: "8px 10px",
      background: C.surface,
      border: "1px solid " + C.rule,
      borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{person.name}</div>
          {person.context_snippet && (
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4, marginTop: 2, fontStyle: "italic" }}>
              {person.context_snippet}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            onClick={function () { setExpanded(function (v) { return !v; }); }}
            style={{
              background: expanded ? C.accentFaint : "none",
              border: "1px solid " + (expanded ? C.accentLine : C.rule),
              borderRadius: 6, padding: "3px 9px",
              fontSize: 10, fontWeight: 600, color: expanded ? C.accent : C.textSoft,
              cursor: "pointer", fontFamily: INTER,
            }}
          >
            {expanded ? "Cancel" : "Add as contact"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              background: "none", border: "none", color: C.textMuted,
              cursor: "pointer", padding: "0 4px", fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={name}
              onChange={function (e) { setName(e.target.value); }}
              placeholder="Name"
              style={{
                flex: 1, minWidth: 120,
                background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 6, padding: "6px 10px",
                fontSize: 16, color: C.text, fontFamily: INTER,
                boxSizing: "border-box",
              }}
            />
            <input
              value={role}
              onChange={function (e) { setRole(e.target.value); }}
              placeholder="Role (optional)"
              style={{
                flex: 1, minWidth: 120,
                background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 6, padding: "6px 10px",
                fontSize: 16, color: C.text, fontFamily: INTER,
                boxSizing: "border-box",
              }}
            />
            <input
              value={email}
              onChange={function (e) { setEmail(e.target.value); }}
              placeholder="Email (optional)"
              type="email"
              style={{
                flex: 1, minWidth: 140,
                background: C.surface, border: "1px solid " + C.rule,
                borderRadius: 6, padding: "6px 10px",
                fontSize: 16, color: C.text, fontFamily: INTER,
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              background: C.accentDeep, border: "none", borderRadius: 6,
              padding: "6px 14px", fontSize: 12, fontWeight: 700, color: C.bg,
              cursor: (saving || !name.trim()) ? "default" : "pointer",
              opacity: (saving || !name.trim()) ? 0.5 : 1,
              fontFamily: INTER, alignSelf: "flex-start",
            }}
          >
            {saving ? "Saving…" : "Save contact"}
          </button>
        </div>
      )}
    </div>
  );
}
