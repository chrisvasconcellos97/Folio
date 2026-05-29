import { useState, useMemo } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { showToast } from "../../components/Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function fmtDate(d) {
  if (!d) return null;
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch (e) { return d; }
}

function findItem(items, id)        { return (items || []).find(function (i) { return i.id === id; }); }
function findProject(projects, id)  { return (projects || []).find(function (p) { return p.id === id; }); }
function findTask(project, taskId)  {
  if (!project || !Array.isArray(project.stages)) return null;
  return project.stages.find(function (t) { return t.id === taskId; });
}

// Initial title surfaced in the editable input. update_item rows expose the
// proposed new text (the field about to land), not the existing item's text.
function initialTitle(row) {
  switch (row.kind) {
    case "new_item":    return row.text || "";
    case "new_task":    return row.title || "";
    case "update_item": return (row.fields && row.fields.text) || "";
    case "update_task": return (row.fields && row.fields.title) || "";
    default:            return "";
  }
}

function hasEditableTitle(kind) {
  return kind === "new_item" || kind === "new_task" || kind === "update_item" || kind === "update_task";
}

// Short label shown above the editable input. Tells the user what the row
// is *doing* without burying it in the textbox.
function rowLeader(row, ctx) {
  switch (row.kind) {
    case "new_item":    return "New item";
    case "new_task": {
      var np = findProject(ctx.activeProjects, row.project_id);
      return "New task on " + (np ? np.title : "project");
    }
    case "update_item": {
      var it = findItem(ctx.existingItems, row.target_id);
      return it ? "Update \"" + (it.text || "").slice(0, 60) + "\"" : "Update item";
    }
    case "update_task": {
      var up = findProject(ctx.activeProjects, row.project_id);
      var ut = findTask(up, row.task_id);
      return "Update task" + (ut ? " \"" + (ut.title || "").slice(0, 60) + "\"" : "") + (up ? " on " + up.title : "");
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

function rowGroup(kind) {
  if (kind === "skip") return "skipped";
  if (kind === "new_item" || kind === "new_task") return "new";
  return "changes";
}

function hasAssignee(kind) { return kind === "new_item" || kind === "new_task"; }
function hasDueEdit(kind)  { return kind === "new_item" || kind === "new_task"; }

// Custom checkbox: native input is visually hidden but still wired for a11y.
// The painted box is a 18×18 rounded square — empty = rule border on dark
// fill, checked = accent fill with white check glyph. Hovering brightens
// the border so it's clear the row is interactive.
function RowCheckbox({ checked, onChange, lowConfidence, ariaLabel }) {
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

function AssigneeSelect({ value, options, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={function (e) { onChange(e.target.value || null); }}
      style={{
        background: C.surface, color: C.text,
        border: "1px solid " + C.rule, borderRadius: 6,
        padding: "4px 8px", fontSize: 11, fontFamily: INTER,
        maxWidth: 180,
      }}
    >
      <option value="">— Unassigned —</option>
      {options.map(function (e) {
        return <option key={e} value={e}>{e}</option>;
      })}
    </select>
  );
}

function DueInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={function (e) { onChange(e.target.value || null); }}
      style={{
        background: C.surface, color: C.text,
        border: "1px solid " + C.rule, borderRadius: 6,
        padding: "4px 8px", fontSize: 11, fontFamily: INTER,
      }}
    />
  );
}

// Inline editable title input. Uses a textarea so long titles wrap, and
// auto-grows on input by syncing height to scrollHeight.
function TitleInput({ value, onChange, edited }) {
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
        fontSize: 13,
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

function SourceExpander({ excerpt, onExcerptChange, edited }) {
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
              fontSize: 12,
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

export function PipSummarizePreview({
  plan,
  existingItems,
  activeProjects,
  orgMembers,
  onApply,
  onCancel,
}) {
  var memberEmails = useMemo(function () {
    return (orgMembers || [])
      .map(function (m) { return m.invited_email || m.email || null; })
      .filter(Boolean);
  }, [orgMembers]);

  // Per-row UI state. titleOverride / excerptOverride land at apply time
  // (excerpt is captured for the future learning loop — no-op today).
  var initialState = useMemo(function () {
    return (plan || []).map(function (r) {
      var t = initialTitle(r);
      return {
        checked: r.confidence !== "low",
        assignee: r.suggested_assignee || null,
        suggestedAssignee: r.suggested_assignee || null,
        due_date: hasDueEdit(r.kind) ? (r.due_date || null) : null,
        title: t,
        initialTitle: t,
        excerpt: r.source_excerpt || "",
        initialExcerpt: r.source_excerpt || "",
      };
    });
  }, [plan]);

  var [state, setState] = useState(initialState);
  var [applying, setApplying] = useState(false);
  var [rowErrors, setRowErrors] = useState({});
  var [showSkipped, setShowSkipped] = useState(false);
  var [touched, setTouched] = useState(false);
  var [confirmCancel, setConfirmCancel] = useState(false);

  function patch(idx, fields) {
    setTouched(true);
    setState(function (prev) {
      var next = prev.slice();
      next[idx] = Object.assign({}, next[idx], fields);
      return next;
    });
  }

  var grouped = useMemo(function () {
    var changes = [];
    var news    = [];
    var skipped = [];
    (plan || []).forEach(function (row, idx) {
      var entry = { row: row, idx: idx };
      var g = rowGroup(row.kind);
      if (g === "skipped")    skipped.push(entry);
      else if (g === "new")   news.push(entry);
      else                    changes.push(entry);
    });
    return { changes: changes, news: news, skipped: skipped };
  }, [plan]);

  var anyChecked = useMemo(function () {
    return state.some(function (s, idx) {
      return s.checked && (plan[idx] && plan[idx].kind !== "skip");
    });
  }, [state, plan]);

  function handleApply() {
    if (applying || !anyChecked) return;
    setApplying(true);
    setRowErrors({});

    var selected = [];
    (plan || []).forEach(function (row, idx) {
      if (row.kind === "skip") return;
      if (!state[idx] || !state[idx].checked) return;
      var merged = Object.assign({}, row);

      // Apply title/text overrides where the row supports inline edits.
      if (hasEditableTitle(row.kind)) {
        var typed = (state[idx].title || "").trim();
        if (typed) {
          if (row.kind === "new_item")    merged.text = typed;
          if (row.kind === "new_task")    merged.title = typed;
          if (row.kind === "update_item") merged.fields = Object.assign({}, row.fields, { text: typed });
          if (row.kind === "update_task") merged.fields = Object.assign({}, row.fields, { title: typed });
        }
      }
      if (hasAssignee(row.kind)) {
        merged.assignee = state[idx].assignee || null;
      }
      if (hasDueEdit(row.kind)) {
        merged.due_date = state[idx].due_date || null;
      }
      merged.suggestedAssignee = state[idx].suggestedAssignee || null;
      merged.source_excerpt_edited = state[idx].excerpt || null;  // future: learning loop
      selected.push({ idx: idx, row: merged });
    });

    Promise.resolve(onApply(selected))
      .then(function (result) {
        setApplying(false);
        if (result && result.errors && Object.keys(result.errors).length) {
          setRowErrors(result.errors);
          showToast("Applied with some errors — check rows below", "warn");
          return;
        }
        var n = selected.length;
        showToast("Applied " + n + " change" + (n === 1 ? "" : "s"));
      })
      .catch(function (err) {
        setApplying(false);
        showToast(err && err.message ? err.message : "Couldn't apply changes");
      });
  }

  // Cancel = dismiss the plan. Notes / summary / meeting are already saved by
  // the caller before this modal opens; we only confirm if the user has touched
  // the plan, otherwise dismiss silently.
  function handleCancelClick() {
    if (touched) { setConfirmCancel(true); return; }
    onCancel();
  }

  function renderRow(entry) {
    var row = entry.row;
    var idx = entry.idx;
    var s   = state[idx] || {};
    var low = row.confidence === "low";
    var titleEdited = hasEditableTitle(row.kind) && (s.title || "") !== (s.initialTitle || "");
    var excerptEdited = (s.excerpt || "") !== (s.initialExcerpt || "");
    var ctx = { existingItems: existingItems, activeProjects: activeProjects };

    return (
      <div
        key={idx}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          background: C.surface,
          border: "1px solid " + (rowErrors[idx] ? C.red : (s.checked ? C.rule : C.bgDark)),
          borderRadius: 8,
          opacity: row.kind === "skip" || !s.checked ? 0.6 : 1,
          transition: "opacity 0.12s ease, border-color 0.12s ease",
        }}
      >
        {row.kind !== "skip" && (
          <div style={{ marginTop: 4 }}>
            <RowCheckbox
              checked={!!s.checked}
              onChange={function (v) { patch(idx, { checked: v }); }}
              lowConfidence={low}
              ariaLabel={(s.checked ? "Selected: " : "Not selected: ") + rowLeader(row, ctx)}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            fontSize: 11, color: C.textMuted, fontFamily: MONO,
            textTransform: "uppercase", letterSpacing: "0.07em",
            lineHeight: 1.4,
          }}>
            {rowLeader(row, ctx)}
          </div>
          {hasEditableTitle(row.kind) ? (
            <TitleInput
              value={s.title || ""}
              onChange={function (v) { patch(idx, { title: v }); }}
              edited={titleEdited}
            />
          ) : null}
          {row.kind === "skip" ? null : (
            <SourceExpander
              excerpt={s.excerpt}
              onExcerptChange={function (v) { patch(idx, { excerpt: v }); }}
              edited={excerptEdited}
            />
          )}
          {(hasAssignee(row.kind) || hasDueEdit(row.kind)) && row.kind !== "skip" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {hasAssignee(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Assignee
                  </span>
                  <AssigneeSelect
                    value={s.assignee}
                    options={memberEmails}
                    onChange={function (v) { patch(idx, { assignee: v }); }}
                  />
                </div>
              )}
              {hasDueEdit(row.kind) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Due
                  </span>
                  <DueInput
                    value={s.due_date}
                    onChange={function (v) { patch(idx, { due_date: v }); }}
                  />
                </div>
              )}
            </div>
          )}
          {row.kind === "update_item" && row.fields && row.fields.due_date && (
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: INTER }}>
              Due → {fmtDate(row.fields.due_date)}
            </div>
          )}
          {rowErrors[idx] && (
            <div style={{ fontSize: 11, color: C.red }}>{rowErrors[idx]}</div>
          )}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: low ? C.yellow : C.textMuted,
          letterSpacing: "0.07em", textTransform: "uppercase", flexShrink: 0,
          marginTop: 2,
        }}>
          {row.confidence}
        </div>
      </div>
    );
  }

  function GroupHeader(props) {
    return (
      <div style={{
        fontFamily: MONO, fontSize: 10, color: C.textMuted,
        fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8, marginTop: props.first ? 0 : 14,
      }}>
        {props.children}
      </div>
    );
  }

  return (
    <Modal title="Pip's plan" onClose={handleCancelClick} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          background: C.accentGlow, border: "1px solid " + C.accentLine, borderRadius: 8,
        }}>
          <PipMark size={8} color={C.accent} glow />
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
            Review each row before applying. Low-confidence rows are unchecked by default —
            uncheck anything you don't want. Tap the title to edit it. <strong>"See source"</strong> opens the
            note that triggered Pip.
          </div>
        </div>

        {(plan || []).length === 0 && (
          <div style={{ fontSize: 13, color: C.textMuted, padding: "8px 0" }}>
            Pip didn't find anything to do here.
          </div>
        )}

        {grouped.changes.length > 0 && (
          <div>
            <GroupHeader first>Changes to existing ({grouped.changes.length})</GroupHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped.changes.map(renderRow)}
            </div>
          </div>
        )}

        {grouped.news.length > 0 && (
          <div>
            <GroupHeader first={grouped.changes.length === 0}>New ({grouped.news.length})</GroupHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grouped.news.map(renderRow)}
            </div>
          </div>
        )}

        {grouped.skipped.length > 0 && (
          <div>
            <button
              onClick={function () { setShowSkipped(function (v) { return !v; }); }}
              style={{
                background: "none", border: "none", color: C.textMuted,
                cursor: "pointer", padding: 0,
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginTop: 14, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{showSkipped ? "▾" : "▸"}</span>
              <span>Skipped duplicates ({grouped.skipped.length})</span>
            </button>
            {showSkipped && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {grouped.skipped.map(renderRow)}
              </div>
            )}
          </div>
        )}

        {confirmCancel && (
          <div style={{
            padding: "12px 14px",
            background: C.bgDark,
            border: "1px solid " + C.yellow,
            borderRadius: 8,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
              Discard Pip's plan? Your notes and summary are already saved — only the
              proposed item changes go away.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={function () { setConfirmCancel(false); }}
                style={{
                  background: "none", border: "1px solid " + C.rule,
                  borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 600, color: C.textSoft,
                  fontFamily: INTER, cursor: "pointer",
                }}
              >
                Keep editing
              </button>
              <button
                onClick={function () { setConfirmCancel(false); onCancel(); }}
                style={{
                  background: C.red, border: "none",
                  borderRadius: 6, padding: "6px 12px",
                  fontSize: 11, fontWeight: 700, color: C.bg,
                  fontFamily: INTER, cursor: "pointer",
                }}
              >
                Discard plan
              </button>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          marginTop: 6, paddingTop: 12, borderTop: "1px solid " + C.rule,
        }}>
          <button
            onClick={handleCancelClick}
            disabled={applying}
            style={{
              background: "none", border: "1px solid " + C.rule,
              borderRadius: 8, padding: "8px 14px",
              fontSize: 12, fontWeight: 600, color: C.textSoft,
              fontFamily: INTER, cursor: applying ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !anyChecked}
            style={{
              background: C.accentDeep, border: "none",
              borderRadius: 8, padding: "8px 16px",
              fontSize: 12, fontWeight: 700, color: C.bg,
              fontFamily: INTER,
              cursor: (applying || !anyChecked) ? "default" : "pointer",
              opacity: (applying || !anyChecked) ? 0.5 : 1,
            }}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
