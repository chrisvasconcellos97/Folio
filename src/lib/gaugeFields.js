// Gauge — custom-field schema helpers.
//
// A project carries a `custom_field_schema` jsonb array of column defs:
//   [{ key, label, type, options?, builtin? }]
//
// Built-in "bones" fields are seeded into every new project's schema.
// User can remove or add more. v1 field types listed below.

import { fmtShort } from "./dateUtils";

export var FIELD_TYPES = [
  { id: "text",      label: "Text"        },
  { id: "longtext",  label: "Long text"   },
  { id: "number",    label: "Number"      },
  { id: "date",      label: "Date"        },
  { id: "dropdown",  label: "Dropdown"    },
  { id: "person",    label: "Person"      },
  { id: "checkbox",  label: "Checkbox"    },
  { id: "url",       label: "URL"         },
];

// "Bones" fields — auto-included in every new project. User can remove.
// `auto` indicates the value is filled by the system, not the user.
export var BONES_FIELDS = [
  { key: "priority",        label: "Priority",        type: "dropdown", options: ["High", "Medium", "Low"], builtin: true },
  { key: "owner",           label: "Owner",           type: "person",   builtin: true, auto: "creator" },
  { key: "submission_date", label: "Submission Date", type: "date",     builtin: true, auto: "created_at" },
  { key: "due_date",        label: "Due Date",        type: "date",     builtin: true },
  { key: "description",     label: "Description",     type: "longtext", builtin: true },
  { key: "related_link",    label: "Related Link",    type: "url",      builtin: true },
];

export function defaultCustomFieldSchema() {
  return BONES_FIELDS.map(function (f) { return Object.assign({}, f); });
}

export var DEFAULT_TASK_STATUS_COLUMNS = ["intake", "in_progress", "done"];

export var TASK_STATUS_LABELS = {
  intake:      "Intake",
  in_progress: "In Progress",
  done:        "Done",
};

export function taskStatusLabel(id) {
  return TASK_STATUS_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ") : "");
}

// Generate a stable-ish key from a label so the schema stays addressable.
export function keyFromLabel(label) {
  return (label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || ("field_" + Math.random().toString(36).slice(2, 7));
}

// Format a custom field value for display in a queue row / inline pill.
export function formatFieldValue(field, val, members) {
  if (val === null || val === undefined || val === "") return null;
  if (field.type === "checkbox") return val ? "✓" : null;
  if (field.type === "date") {
    return fmtShort(val) || String(val);
  }
  if (field.type === "person") {
    if (members) {
      var m = members.find(function (x) { return (x.email || "") === val; });
      if (m) return m.full_name || m.email || val;
    }
    return val;
  }
  if (field.type === "url") return val.replace(/^https?:\/\//, "").slice(0, 30);
  if (field.type === "longtext") return val.length > 60 ? val.slice(0, 57) + "…" : val;
  if (field.type === "number") return String(val);
  return String(val);
}
