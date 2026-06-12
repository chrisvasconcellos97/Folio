import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { taskStatusLabel } from "../../lib/gaugeFields";
import { AccountPicker } from "../../components/AccountPicker";
import { PersonPicker } from "../../components/PersonPicker";
import { useEntityDetection } from "../../hooks/useEntityDetection";
import { EntitySuggestionChip } from "../../components/EntitySuggestionChip";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// Unified detail panel for a single Gauge task. Handles both create
// (project + index === null) and edit (existing task at index). Renders
// every custom field defined in the parent project's schema plus the
// "bones" basics (title + assignee + account + task_status).
var SEVEN_DAYS_MS = 7 * 86400 * 1000;

export function TaskDetailPanel({
  project,
  task,           // null for "new task" mode
  taskIndex,      // number for edit, null for new
  accounts,
  members,
  contacts,       // optional: [{ id, name, role }] — account contacts as assignee options
  aliases,        // optional: contact aliases for entity detection
  userEmail,
  onSave,         // (taskShape) => Promise — caller does the project update
  onDelete,       // optional: (taskIndex) => Promise
  onClose,
  logCorrection,  // optional: (entry) => void — captures V2-brain corrections
}) {
  var schema = project.custom_field_schema || [];
  var statusColumns = project.task_status_columns || ["intake", "in_progress", "done"];

  function defaultCustomFieldValue(f) {
    if (task && task.custom_fields && task.custom_fields[f.key] !== undefined) {
      return task.custom_fields[f.key];
    }
    // Auto-fill owner on a brand-new task to the creator (current user).
    if (!task && f.auto === "creator" && f.type === "person" && userEmail) return userEmail;
    // Submission date auto-defaults to today on new tasks.
    if (!task && f.auto === "created_at" && f.type === "date") {
      return new Date().toISOString().slice(0, 10);
    }
    if (f.type === "checkbox") return false;
    return "";
  }

  var [title, setTitle]         = useState(task ? task.title || "" : "");
  var [assignee, setAssignee]   = useState(task ? task.assignee_email || "" : "");
  var [recipient, setRecipient] = useState(task ? task.recipient || "" : "");
  var [waitingOn, setWaitingOn] = useState(task ? task.waiting_on || "" : "");
  var [accountId, setAccountId] = useState(task ? task.account_id || "" : "");
  var [taskStatus, setTaskStatus] = useState(task ? (task.task_status || statusColumns[0]) : statusColumns[0]);
  var [completed, setCompleted] = useState(task ? !!task.completed_at : false);
  var [customFields, setCustomFields] = useState(function () {
    var initial = {};
    schema.forEach(function (f) { initial[f.key] = defaultCustomFieldValue(f); });
    return initial;
  });
  var [saving, setSaving]       = useState(false);
  var [confirmDel, setConfirmDel] = useState(false);
  var [suggestionDismissed, setSuggestionDismissed] = useState(false);

  var entitySuggestion = useEntityDetection(title, contacts || [], aliases || [], accounts || []);

  var projectAccount = project.account_id
    ? (accounts || []).find(function (a) { return a.id === project.account_id; })
    : null;
  // Show "Dept / Partner" field only when project has no account, or project's account is internal_team or partner.
  var showDeptPartnerField = !projectAccount ||
    projectAccount.account_type === "internal_team" ||
    projectAccount.account_type === "partner";

  function updateCustom(key, val) {
    setCustomFields(function (prev) { return Object.assign({}, prev, { [key]: val }); });
  }

  // The task's accounts — surfaced first in the people picker, in order:
  // project's primary, then its other linked accounts, then the selected account.
  var taskAccountIds = useMemo(function () {
    var ids = [];
    function add(id) { if (id && ids.indexOf(id) === -1) ids.push(id); }
    add(project.account_id);
    (project.account_ids || []).forEach(add);
    add(accountId);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.account_id, (project.account_ids || []).join(","), accountId]);

  // Shared person picker — used by both Assignee and Recipient so the two stay
  // consistent. Grouped by workspace (account contacts first, then My Team, then
  // everyone else), with a free-text escape hatch. Preserves the stored-value
  // convention (contact name) used by the queue/Mine surfaces.
  function personSelect(value, setValue, noneLabel) {
    return (
      <PersonPicker
        value={value}
        onChange={function (v) { setValue(v || ""); }}
        members={members}
        contacts={contacts}
        accounts={accounts}
        accountIds={taskAccountIds}
        noneLabel={noneLabel}
        contactValue={function (c) { return c.name; }}
      />
    );
  }

  function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    var newTitle = title.trim();
    var taskShape = Object.assign({}, task || {}, {
      title:          newTitle,
      assignee_email: assignee || null,
      recipient:      recipient || null,
      waiting_on:       waitingOn || null,
      waiting_on_since: waitingOn
        ? ((task && task.waiting_on === waitingOn && task.waiting_on_since) || new Date().toISOString().slice(0, 10))
        : null,
      account_id:     accountId || null,
      task_status:    taskStatus,
      completed_at:   completed ? (task && task.completed_at ? task.completed_at : new Date().toISOString()) : null,
      custom_fields:  customFields,
      created_at:     task && task.created_at ? task.created_at : new Date().toISOString(),
      // Preserve legacy fields for back-compat with the discrete editor.
      sub_stages:     task && task.sub_stages ? task.sub_stages : [],
      is_external:    task && task.is_external ? task.is_external : false,
      blocked_reason: task && task.blocked_reason !== undefined ? task.blocked_reason : null,
    });
    var originalAccountId = task ? (task.account_id || "") : "";
    Promise.resolve(onSave(taskShape, taskIndex))
      .then(function () {
        setSaving(false);
        if (logCorrection && task) {
          // Correction: task text edited within 7 days of Pip creation.
          if (
            task.pip_created_at &&
            (Date.now() - new Date(task.pip_created_at).getTime()) < SEVEN_DAYS_MS &&
            newTitle !== (task.title || "").trim()
          ) {
            logCorrection({
              correction_type: 'task_text_edit',
              account_id:      accountId || task.account_id || null,
              meeting_id:      null,
              original_value:  { kind: 'task', original: task.title, pip_created_at: task.pip_created_at },
              corrected_value: { text: newTitle },
              reason:          null,
            });
          }
          // Correction: account re-routed after the fact.
          if (accountId !== originalAccountId) {
            logCorrection({
              correction_type: 'routed_account_changed',
              account_id:      accountId || null,
              meeting_id:      null,
              original_value:  { kind: 'task', original_account_id: originalAccountId || null, title: task.title },
              corrected_value: { account_id: accountId || null },
              reason:          null,
            });
          }
        }
        onClose();
      })
      .catch(function () { setSaving(false); });
  }

  function handleDelete() {
    if (!onDelete || taskIndex == null) return;
    Promise.resolve(onDelete(taskIndex)).then(onClose).catch(function () { /* guard-ok: delete callback, panel closes either way */ });
  }

  function renderField(f) {
    var v = customFields[f.key];
    if (f.type === "longtext") {
      return (
        <TextArea
          value={v || ""}
          onChange={function (e) { updateCustom(f.key, e.target.value); }}
          rows={3}
          placeholder={f.label}
        />
      );
    }
    if (f.type === "date") {
      return (
        <InputField
          type="date"
          value={v || ""}
          onChange={function (e) { updateCustom(f.key, e.target.value); }}
        />
      );
    }
    if (f.type === "number") {
      return (
        <InputField
          type="number"
          value={v == null ? "" : v}
          onChange={function (e) { updateCustom(f.key, e.target.value); }}
          placeholder={f.label}
        />
      );
    }
    if (f.type === "checkbox") {
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!v}
            onChange={function (e) { updateCustom(f.key, e.target.checked); }}
            style={{ accentColor: C.accent, width: 16, height: 16 }}
          />
          <span style={{ fontSize: 12, color: C.textSoft, fontFamily: INTER }}>{v ? "Yes" : "No"}</span>
        </label>
      );
    }
    if (f.type === "url") {
      return (
        <InputField
          type="url"
          value={v || ""}
          onChange={function (e) { updateCustom(f.key, e.target.value); }}
          placeholder="https://…"
        />
      );
    }
    if (f.type === "dropdown") {
      return (
        <SelectField
          value={v || ""}
          onChange={function (e) { updateCustom(f.key, e.target.value); }}
        >
          <option value="">— Select —</option>
          {(f.options || []).map(function (o) {
            return <option key={o} value={o}>{o}</option>;
          })}
        </SelectField>
      );
    }
    if (f.type === "person") {
      return (
        <PersonPicker
          value={v || ""}
          onChange={function (val) { updateCustom(f.key, val || ""); }}
          members={members}
          contacts={contacts}
          accounts={accounts}
          accountIds={taskAccountIds}
          noneLabel="— Unassigned —"
          contactValue={function (c) { return c.name; }}
        />
      );
    }
    return (
      <InputField
        value={v || ""}
        onChange={function (e) { updateCustom(f.key, e.target.value); }}
        placeholder={f.label}
      />
    );
  }

  return (
    <Modal
      title={taskIndex == null ? "New Task" : "Edit Task"}
      onClose={onClose}
      width={520}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Project context — admin needs to know which workflow this belongs to. */}
        <div style={{
          fontFamily: MONO, fontSize: 10, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Project · {project.title}
        </div>

        {/* Title */}
        <div>
          <FL>Task Title *</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); setSuggestionDismissed(false); }}
            placeholder="What is this task?"
            autoFocus
          />
          <EntitySuggestionChip
            suggestion={suggestionDismissed ? null : entitySuggestion}
            onAcceptAssignee={function () {
              if (entitySuggestion) {
                if (entitySuggestion.type === "account") {
                  setAccountId(entitySuggestion.account.id);
                } else if (entitySuggestion.contact) {
                  setAssignee(entitySuggestion.contact.email || entitySuggestion.contact.name || "");
                }
              }
              setSuggestionDismissed(true);
            }}
            onAcceptRecipient={function () {
              if (entitySuggestion && entitySuggestion.contact) {
                setRecipient(entitySuggestion.contact.email || entitySuggestion.contact.name || "");
              }
              setSuggestionDismissed(true);
            }}
            onDismiss={function () { setSuggestionDismissed(true); }}
          />
        </div>

        {/* Department / Partner link (hidden when task is already on a customer account) */}
        {showDeptPartnerField && accounts && accounts.length > 0 && (
          <div>
            <FL>Linked Account</FL>
            <AccountPicker
              accounts={accounts}
              value={accountId || null}
              onChange={function (id) { setAccountId(id || ""); }}
              placeholder="Search accounts…"
              allowNone
              noneLabel="— None —"
            />
          </div>
        )}

        {/* Assignee — who does the work; drives admin queue surfacing */}
        <div>
          <FL>Assignee</FL>
          {personSelect(assignee, setAssignee, "— Unassigned —")}
        </div>

        {/* Recipient — who the task is for / who you'll send something to.
            Distinct from assignee: the assignee does it, the recipient
            receives the output. Pre-fillable from the entity-detection chip. */}
        <div>
          <FL>Recipient</FL>
          {personSelect(recipient, setRecipient, "— No recipient —")}
          <div style={{ fontFamily: INTER, fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Who this is for — who you’ll send something to or do this for.
          </div>
        </div>

        {/* Waiting on — who's holding the ball right now (Phase 1.4) */}
        <div>
          <FL>Waiting on</FL>
          {personSelect(waitingOn, setWaitingOn, "— Nobody (not blocked) —")}
          <div style={{ fontFamily: INTER, fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Who you're blocked on. Surfaces on Home under "They owe you" with days held.
          </div>
        </div>

        {/* Task status (kanban column for standing; reference for discrete) */}
        {project.is_standing && (
          <div>
            <FL>Status</FL>
            <SelectField
              value={taskStatus}
              onChange={function (e) { setTaskStatus(e.target.value); }}
            >
              {statusColumns.map(function (c) {
                return <option key={c} value={c}>{taskStatusLabel(c)}</option>;
              })}
            </SelectField>
          </div>
        )}

        {/* Complete toggle — universal */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={completed}
            onChange={function (e) { setCompleted(e.target.checked); }}
            style={{ accentColor: C.accent, width: 16, height: 16 }}
          />
          <span style={{ fontSize: 13, color: C.text, fontFamily: INTER }}>Mark complete</span>
        </label>

        {/* Custom fields — every column from the project's schema */}
        {schema.length > 0 && (
          <div style={{
            borderTop: "1px solid " + C.rule, paddingTop: 12,
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            {schema.map(function (f) {
              return (
                <div key={f.key}>
                  <FL>{f.label}</FL>
                  {renderField(f)}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 6, flexWrap: "wrap", gap: 8,
        }}>
          <div>
            {taskIndex != null && onDelete && !confirmDel && (
              <button
                onClick={function () { setConfirmDel(true); }}
                style={{
                  background: "transparent", border: "1px solid " + C.red,
                  borderRadius: 20, padding: "6px 13px", fontSize: 11,
                  color: C.red, fontFamily: INTER, cursor: "pointer",
                }}
              >Delete</button>
            )}
            {taskIndex != null && onDelete && confirmDel && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <button
                  onClick={handleDelete}
                  style={{
                    background: C.red, border: "none", borderRadius: 20,
                    padding: "6px 13px", fontSize: 11, color: "#fff",
                    fontFamily: INTER, cursor: "pointer",
                  }}
                >Yes</button>
                <button
                  onClick={function () { setConfirmDel(false); }}
                  style={{
                    background: "transparent", border: "1px solid " + C.rule,
                    borderRadius: 20, padding: "6px 13px", fontSize: 11,
                    color: C.textSoft, fontFamily: INTER, cursor: "pointer",
                  }}
                >No</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "1px solid " + C.border,
                borderRadius: 20, padding: "8px 18px", fontSize: 12,
                fontWeight: 600, color: C.textSoft, fontFamily: INTER, cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              style={{
                background: !title.trim() || saving ? C.accentFaint : C.accentDeep,
                border: "none", borderRadius: 20, padding: "8px 22px",
                fontSize: 12, fontWeight: 600,
                color: !title.trim() || saving ? C.textMuted : C.bg,
                fontFamily: INTER,
                cursor: !title.trim() || saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : taskIndex == null ? "Add Task" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
