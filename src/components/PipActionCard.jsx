import { useState, useMemo } from "react";
import { C } from "../lib/colors";
import { PipOrb } from "./PipMark";
import { InputField, TextArea, SelectField } from "./InputField";
import {
  getFieldsForTool,
  displayTitleFor,
} from "../lib/pipTools";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// PipActionCard — confirmation card for a single confirm-required tool call.
//
// Props:
//   tool        — { id, name, input } the pending tool call
//   accounts    — full account list (for resolving + the dropdown)
//   onConfirm(updatedTool)  — fire the underlying executor
//   onDiscard()             — drop without firing
//   compact     — bool — when true, used inside PipActionBatch (no own margin/border)
//   skipped     — bool — render in skipped state (used by batch)
//
// Internal modes: "preview" | "edit" | "saving" | "done"

var DOW_OPTIONS = [
  { value: "",  label: "—" },
  { value: 0,   label: "Sunday" },
  { value: 1,   label: "Monday" },
  { value: 2,   label: "Tuesday" },
  { value: 3,   label: "Wednesday" },
  { value: 4,   label: "Thursday" },
  { value: 5,   label: "Friday" },
  { value: 6,   label: "Saturday" },
];

var FREQ_OPTIONS = [
  { value: "",         label: "—" },
  { value: "weekly",   label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly",  label: "Monthly" },
];

var MONTHLY_TYPE_OPTIONS = [
  { value: "",             label: "—" },
  { value: "day_of_month", label: "Day of month" },
  { value: "day_of_week",  label: "Day of week" },
];

var MONTHLY_ORD_OPTIONS = [
  { value: "",       label: "—" },
  { value: "first",  label: "First" },
  { value: "second", label: "Second" },
  { value: "third",  label: "Third" },
  { value: "fourth", label: "Fourth" },
  { value: "last",   label: "Last" },
];

var HEALTH_OPTIONS = [
  { value: "active",  label: "Active",  color: C.green },
  { value: "at_risk", label: "At risk", color: C.yellow },
  { value: "cold",    label: "Cold",    color: C.red },
];

function todayPlusDays(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function isMissing(field) {
  if (!field.required) return false;
  if (field.value === "" || field.value == null) return true;
  return false;
}

// Selector chip row used for health status edit.
function HealthChips({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {HEALTH_OPTIONS.map(function (opt) {
        var selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={function () { onChange(opt.value); }}
            style={{
              background: selected ? "rgba(77,184,150,0.15)" : "transparent",
              border: "1px solid " + (selected ? opt.color : C.rule),
              borderRadius: 999,
              padding: "5px 12px",
              fontFamily: INTER,
              fontSize: 12,
              color: selected ? opt.color : C.textSoft,
              fontWeight: selected ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AccountDropdown({ value, accounts, onChange }) {
  var hasMatch = !value || accounts.some(function (a) { return a.id === value; });
  return (
    <div>
      <SelectField
        value={value || ""}
        onChange={function (e) { onChange(e.target.value || ""); }}
      >
        <option value="">— Select account —</option>
        {accounts.map(function (a) {
          return <option key={a.id} value={a.id}>{a.name}</option>;
        })}
      </SelectField>
      {value && !hasMatch && (
        <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, color: C.yellow }}>
          Unknown account — please re-select
        </div>
      )}
    </div>
  );
}

function EditControl({ field, accounts, onChange }) {
  switch (field.kind) {
    case "account":
      return <AccountDropdown value={field.value} accounts={accounts} onChange={onChange} />;
    case "date":
      return (
        <InputField
          type="date"
          value={field.value || ""}
          onChange={function (e) { onChange(e.target.value); }}
        />
      );
    case "textarea":
      return (
        <TextArea
          value={field.value || ""}
          onChange={function (e) { onChange(e.target.value); }}
          rows={3}
        />
      );
    case "health_status":
      return <HealthChips value={field.value} onChange={onChange} />;
    case "frequency":
      return (
        <SelectField value={field.value || ""} onChange={function (e) { onChange(e.target.value); }}>
          {FREQ_OPTIONS.map(function (o) { return <option key={String(o.value)} value={o.value}>{o.label}</option>; })}
        </SelectField>
      );
    case "day_of_week":
      return (
        <SelectField
          value={field.value === "" || field.value == null ? "" : String(field.value)}
          onChange={function (e) {
            var v = e.target.value;
            onChange(v === "" ? "" : parseInt(v, 10));
          }}
        >
          {DOW_OPTIONS.map(function (o) { return <option key={String(o.value)} value={o.value}>{o.label}</option>; })}
        </SelectField>
      );
    case "monthly_type":
      return (
        <SelectField value={field.value || ""} onChange={function (e) { onChange(e.target.value); }}>
          {MONTHLY_TYPE_OPTIONS.map(function (o) { return <option key={String(o.value)} value={o.value}>{o.label}</option>; })}
        </SelectField>
      );
    case "monthly_ordinal":
      return (
        <SelectField value={field.value || ""} onChange={function (e) { onChange(e.target.value); }}>
          {MONTHLY_ORD_OPTIONS.map(function (o) { return <option key={String(o.value)} value={o.value}>{o.label}</option>; })}
        </SelectField>
      );
    case "time":
      return (
        <InputField
          type="time"
          value={field.value || ""}
          onChange={function (e) { onChange(e.target.value); }}
        />
      );
    case "integer":
      return (
        <InputField
          type="number"
          value={field.value || ""}
          onChange={function (e) { onChange(e.target.value); }}
        />
      );
    case "text":
    default:
      return (
        <InputField
          value={field.value || ""}
          onChange={function (e) { onChange(e.target.value); }}
        />
      );
  }
}

// Coerces an edited-input object so it lines up with what the executor wants:
//   - day_of_week → int (already coerced in EditControl)
//   - day_of_month → int from string
//   - empty strings → undefined for optional keys
function normalizeInput(name, draft) {
  var out = Object.assign({}, draft);
  Object.keys(out).forEach(function (k) {
    if (out[k] === "") delete out[k];
  });
  if (out.day_of_month != null && typeof out.day_of_month === "string") {
    var n = parseInt(out.day_of_month, 10);
    out.day_of_month = isNaN(n) ? undefined : n;
  }
  return out;
}

// Default-fill any missing required date with today+7.
function applyDateDefaults(name, draft) {
  var out = Object.assign({}, draft);
  if (name === "create_open_item" && !out.due_date) {
    // due_date is optional — leave blank
  }
  if (name === "set_follow_up" && !out.follow_up_date) {
    out.follow_up_date = todayPlusDays(7);
  }
  if (name === "log_meeting" && !out.meeting_date) {
    out.meeting_date = todayPlusDays(0);
  }
  return out;
}

export function PipActionCard(props) {
  var tool       = props.tool;
  var accounts   = props.accounts || [];
  var onConfirm  = props.onConfirm;
  var onDiscard  = props.onDiscard;
  var compact    = !!props.compact;
  var skipped    = !!props.skipped;

  // Pending mode: preview / edit / saving / done
  var [mode, setMode]   = useState("preview");
  // Working draft of the tool input — edits go here until Save commits them.
  var [draft, setDraft] = useState(function () { return Object.assign({}, tool.input || {}); });
  var [doneMsg, setDoneMsg] = useState("");

  var fields = useMemo(function () {
    return getFieldsForTool(tool.name, draft, accounts);
  }, [tool.name, draft, accounts]);

  var title = "Pip wants to " + displayTitleFor(tool.name);

  var disabledSave = fields.some(isMissing);

  function setField(key, value) {
    setDraft(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = value;
      return next;
    });
  }

  function handleConfirm() {
    if (mode === "saving" || mode === "done") return;
    setMode("saving");
    var normalized = normalizeInput(tool.name, applyDateDefaults(tool.name, draft));
    var commit = Object.assign({}, tool, { input: normalized });
    Promise.resolve(onConfirm(commit))
      .then(function (r) {
        if (r && r.ok === false) {
          setMode("preview");
          return;
        }
        setDoneMsg((r && r.message) || "Done");
        setMode("done");
        // Parent removes this card from `pending` on success, but the success
        // state is left visible briefly via the message-mutation timing.
      })
      .catch(function () { setMode("preview"); });
  }

  function handleEnterEdit() { setMode("edit"); }
  function handleCancelEdit() {
    setDraft(Object.assign({}, tool.input || {}));
    setMode("preview");
  }
  function handleSaveEdit() {
    if (disabledSave) return;
    setMode("preview");
  }
  function handleDiscard() {
    if (mode === "saving" || mode === "done") return;
    onDiscard && onDiscard();
  }

  var outerStyle = compact
    ? {
        background: skipped ? "transparent" : "rgba(255,255,255,0.015)",
        border: "1px solid " + (skipped ? C.ruleSoft : C.rule),
        borderRadius: 8,
        padding: "10px 12px",
        opacity: skipped ? 0.55 : 1,
        display: "flex", flexDirection: "column", gap: 8,
      }
    : {
        marginLeft: 42,
        background: C.surface,
        border: "1px solid " + C.accentBorder,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      };

  return (
    <div style={outerStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!compact && <PipOrb size="xs" />}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              color: skipped ? C.textMuted : C.accent,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {skipped ? "Skipped" : (mode === "done" ? "Done" : title)}
          </div>
          {mode === "done" && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: C.text, marginTop: 4 }}>
              {doneMsg}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {mode !== "done" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 14,
            rowGap: mode === "edit" ? 10 : 6,
            alignItems: "baseline",
          }}
        >
          {fields.map(function (f) {
            var missing = isMissing(f);
            return (
              <Row
                key={f.key}
                field={f}
                missing={missing}
                editing={mode === "edit"}
                accounts={accounts}
                onChange={function (v) { setField(f.key, v); }}
              />
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!skipped && mode !== "done" && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {mode === "preview" && (
            <>
              <button onClick={handleDiscard} style={btnGhost}>Discard</button>
              <button onClick={handleEnterEdit} style={btnOutline}>Edit</button>
              <button onClick={handleConfirm} style={btnSolid}>Confirm</button>
            </>
          )}
          {mode === "edit" && (
            <>
              <button onClick={handleCancelEdit} style={btnGhost}>Cancel</button>
              <button
                onClick={handleSaveEdit}
                disabled={disabledSave}
                style={Object.assign({}, btnSolid, disabledSave ? { opacity: 0.4, cursor: "default" } : {})}
              >
                Save
              </button>
            </>
          )}
          {mode === "saving" && (
            <>
              <button disabled style={Object.assign({}, btnGhost, { opacity: 0.5, cursor: "default" })}>Discard</button>
              <button disabled style={Object.assign({}, btnSolid, { opacity: 0.5, cursor: "default" })}>
                Working…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ field, missing, editing, accounts, onChange }) {
  return (
    <>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: missing ? C.yellow : C.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          paddingTop: editing ? 10 : 0,
          whiteSpace: "nowrap",
        }}
      >
        {field.label}{field.required ? "*" : ""}
      </div>
      <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.45 }}>
        {editing ? (
          <EditControl field={field} accounts={accounts} onChange={onChange} />
        ) : (
          <span style={{ color: missing ? C.yellow : C.text, fontVariantNumeric: "tabular-nums" }}>
            {field.displayValue}
          </span>
        )}
      </div>
    </>
  );
}

var btnGhost = {
  background: "transparent",
  border: "1px solid " + C.rule,
  color: C.textMuted,
  padding: "7px 14px",
  borderRadius: 6,
  fontFamily: MONO,
  fontSize: 10.5,
  cursor: "pointer",
};

var btnOutline = {
  background: "transparent",
  border: "1px solid " + C.accentBorder,
  color: C.accent,
  padding: "7px 14px",
  borderRadius: 6,
  fontFamily: MONO,
  fontSize: 10.5,
  cursor: "pointer",
};

var btnSolid = {
  background: C.accentDeep,
  border: "none",
  color: C.bg,
  padding: "7px 14px",
  borderRadius: 6,
  fontFamily: MONO,
  fontSize: 10.5,
  fontWeight: 700,
  cursor: "pointer",
};
