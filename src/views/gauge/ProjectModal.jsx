import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField, TextArea, SelectField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { DangerBtn } from "../../components/Buttons";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../components/Toast";
import { defaultCustomFieldSchema, DEFAULT_TASK_STATUS_COLUMNS } from "../../lib/gaugeFields";
import { CustomFieldSchemaEditor } from "./CustomFieldSchemaEditor";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";

var STATUS_OPTS = [
  { value: "planned",     label: "Planned"     },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked",     label: "Blocked"     },
  { value: "complete",    label: "Complete"    },
  { value: "on_hold",     label: "On Hold"     },
];

var PRIORITY_OPTS = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

function memberLabel(m) {
  return m.full_name || m.email || "";
}

// Normalize stages from existing data — handle old format gracefully
function normalizeStages(stages) {
  if (!stages || stages.length === 0) return [];
  return stages.map(function (s) {
    return {
      title:                s.title || "",
      completed_at:         s.completed_at || null,
      assignee_email:       s.assignee_email || null,
      is_external:          s.is_external || false,
      external_contact_id:  s.external_contact_id || null,
      external_contact_name: s.external_contact_name || null,
      blocked_reason:       s.blocked_reason || null,
      sub_stages:           (s.sub_stages || []).map(function (sub) {
        return { title: sub.title || "", completed_at: sub.completed_at || null };
      }),
    };
  });
}

export function ProjectModal({
  existing,
  accounts,
  members,
  userId,
  onSave,
  onDelete,
  onClose,
  addTemplate,
  prefillTemplate,
}) {
  // Determine initial account_ids from existing or prefill
  var initAccountIds = (function () {
    if (existing) {
      if (existing.account_ids && existing.account_ids.length > 0) return existing.account_ids;
      if (existing.account_id) return [existing.account_id];
      return [];
    }
    return [];
  })();

  var [title, setTitle]             = useState(prefillTemplate ? prefillTemplate.title : (existing ? existing.title : ""));
  var [description, setDesc]        = useState(existing ? existing.description || "" : "");
  var [status, setStatus]           = useState(existing ? existing.status : "planned");
  var [priority, setPriority]       = useState(existing ? existing.priority : "medium");
  var [dueDate, setDueDate]         = useState(existing ? existing.due_date || "" : "");
  var [startDate, setStartDate]     = useState(existing ? existing.start_date || "" : "");
  var [accountIds, setAccountIds]   = useState(initAccountIds);
  var [scope, setScope]             = useState(existing ? existing.scope || "personal" : "personal");
  var [assigneeEmail, setAssignee]  = useState(existing ? existing.assignee || "" : "");
  var [requestedBy, setRequestedBy] = useState(existing ? existing.requested_by || "" : "");
  var [blockedReason, setBlockedReason] = useState(existing ? existing.blocked_reason || "" : "");
  var [stages, setStages]           = useState(
    prefillTemplate
      ? normalizeStages(prefillTemplate.stages)
      : normalizeStages(existing ? existing.stages : [])
  );
  var [isStanding, setIsStanding]   = useState(
    existing ? !!existing.is_standing
    : prefillTemplate ? !!prefillTemplate.is_standing
    : false
  );
  var [customFieldSchema, setCustomFieldSchema] = useState(
    existing && existing.custom_field_schema && existing.custom_field_schema.length > 0
      ? existing.custom_field_schema
      : (prefillTemplate && prefillTemplate.custom_field_schema && prefillTemplate.custom_field_schema.length > 0
        ? prefillTemplate.custom_field_schema
        : defaultCustomFieldSchema())
  );
  var [taskStatusColumns, setTaskStatusColumns] = useState(
    existing && existing.task_status_columns && existing.task_status_columns.length > 0
      ? existing.task_status_columns
      : (prefillTemplate && prefillTemplate.task_status_columns && prefillTemplate.task_status_columns.length > 0
        ? prefillTemplate.task_status_columns
        : DEFAULT_TASK_STATUS_COLUMNS.slice())
  );
  var [showSchemaEditor, setShowSchemaEditor] = useState(false);
  var [newStageTitle, setNewStageTitle] = useState("");
  var [saving, setSaving]           = useState(false);
  var [confirmDel, setConfirmDel]   = useState(false);
  var [confirmDraft, setConfirmDraft] = useState(false);

  // Track whether the form has unsaved content so we can prompt on X-close
  var defaultSchemaLen = defaultCustomFieldSchema().length;
  var hasContent = (
    title.trim() !== "" ||
    description.trim() !== "" ||
    stages.length > 0 ||
    customFieldSchema.length > defaultSchemaLen
  );

  // Intercept close: if new project and has content, show draft prompt
  function onCloseRequest() {
    // Editing an existing project (including a draft being resumed) — just close
    if (existing) { onClose(); return; }
    if (hasContent) {
      setConfirmDraft(true);
    } else {
      onClose();
    }
  }

  // Save as draft and close
  function handleSaveAsDraft() {
    if (saving) return;
    setSaving(true);
    onSave({
      title:         title.trim() || "Untitled Draft",
      description:   description.trim() || null,
      status:        "draft",
      priority,
      due_date:      dueDate || null,
      start_date:    startDate || null,
      account_id:    accountIds[0] || null,
      account_ids:   accountIds,
      scope,
      assignee:      (scope === "team" && assigneeEmail) ? assigneeEmail : null,
      requested_by:  requestedBy || null,
      blocked_reason: null,
      stages,
      is_standing:   isStanding,
      custom_field_schema: customFieldSchema,
      task_status_columns: taskStatusColumns,
    }).then(function () {
      setSaving(false);
      showToast("Draft saved");
      onClose();
    }).catch(function () {
      setSaving(false);
      showToast("Couldn't save draft", "error");
    });
  }

  // Contacts for Requested By (loaded when account_ids changes)
  var [contacts, setContacts]       = useState([]);

  // Stage expand state (show sub-stages)
  var [expandedStages, setExpandedStages] = useState({});

  // Load contacts for selected accounts
  useEffect(function () {
    if (accountIds.length === 0) { setContacts([]); return; }
    supabase
      .from("folio_contacts")
      .select("id, name, account_id")
      .in("account_id", accountIds)
      .then(function (result) {
        if (!result.error) setContacts(result.data || []);
      });
  }, [accountIds.join(",")]);

  // --- Stage helpers ---

  function addStage() {
    if (!newStageTitle.trim()) return;
    setStages(function (prev) {
      return prev.concat([{
        title: newStageTitle.trim(),
        completed_at: null,
        assignee_email: null,
        is_external: false,
        external_contact_id: null,
        external_contact_name: null,
        blocked_reason: null,
        sub_stages: [],
      }]);
    });
    setNewStageTitle("");
  }

  function toggleStage(idx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== idx) return s;
        return Object.assign({}, s, { completed_at: s.completed_at ? null : new Date().toISOString() });
      });
    });
  }

  function removeStage(idx) {
    setStages(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
  }

  function updateStageField(idx, field, value) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== idx) return s;
        return Object.assign({}, s, { [field]: value });
      });
    });
  }

  function toggleExternal(idx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== idx) return s;
        return Object.assign({}, s, {
          is_external: !s.is_external,
          assignee_email: !s.is_external ? null : s.assignee_email,
          external_contact_id: !s.is_external ? null : s.external_contact_id,
          external_contact_name: !s.is_external ? null : s.external_contact_name,
        });
      });
    });
  }

  function toggleStageBlocked(idx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== idx) return s;
        return Object.assign({}, s, { blocked_reason: s.blocked_reason !== null ? null : "" });
      });
    });
  }

  function toggleExpand(idx) {
    setExpandedStages(function (prev) {
      return Object.assign({}, prev, { [idx]: !prev[idx] });
    });
  }

  // Sub-stage helpers
  function addSubStage(stageIdx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== stageIdx) return s;
        var subs = (s.sub_stages || []).concat([{ title: "New step", completed_at: null }]);
        return Object.assign({}, s, { sub_stages: subs });
      });
    });
    setExpandedStages(function (prev) { return Object.assign({}, prev, { [stageIdx]: true }); });
  }

  function toggleSubStage(stageIdx, subIdx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== stageIdx) return s;
        var subs = (s.sub_stages || []).map(function (sub, j) {
          if (j !== subIdx) return sub;
          return Object.assign({}, sub, { completed_at: sub.completed_at ? null : new Date().toISOString() });
        });
        return Object.assign({}, s, { sub_stages: subs });
      });
    });
  }

  function updateSubStageTitle(stageIdx, subIdx, value) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== stageIdx) return s;
        var subs = (s.sub_stages || []).map(function (sub, j) {
          if (j !== subIdx) return sub;
          return Object.assign({}, sub, { title: value });
        });
        return Object.assign({}, s, { sub_stages: subs });
      });
    });
  }

  function removeSubStage(stageIdx, subIdx) {
    setStages(function (prev) {
      return prev.map(function (s, i) {
        if (i !== stageIdx) return s;
        var subs = (s.sub_stages || []).filter(function (_, j) { return j !== subIdx; });
        return Object.assign({}, s, { sub_stages: subs });
      });
    });
  }

  // --- Account multi-select ---
  function toggleAccount(id) {
    setAccountIds(function (prev) {
      if (prev.indexOf(id) !== -1) return prev.filter(function (x) { return x !== id; });
      return prev.concat([id]);
    });
  }

  function selectAllByType(type) {
    var ids = (accounts || [])
      .filter(function (a) { return a.account_type === type; })
      .map(function (a) { return a.id; });
    setAccountIds(function (prev) {
      var merged = prev.slice();
      ids.forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
      return merged;
    });
  }

  // --- Save & Template ---

  function handleSave() {
    if (!title.trim() || saving) return;
    if (status === "blocked" && !blockedReason.trim()) return;
    setSaving(true);
    // If this is a draft being promoted via the Save button, bump to "planned"
    var saveStatus = status === "draft" ? "planned" : status;
    onSave({
      title:         title.trim(),
      description:   description.trim() || null,
      status:        saveStatus,
      priority,
      due_date:      dueDate || null,
      start_date:    startDate || null,
      account_id:    accountIds[0] || null,
      account_ids:   accountIds,
      scope,
      assignee:      (scope === "team" && assigneeEmail) ? assigneeEmail : null,
      requested_by:  requestedBy || null,
      blocked_reason: status === "blocked" ? blockedReason.trim() : null,
      stages,
      is_standing:   isStanding,
      custom_field_schema: customFieldSchema,
      task_status_columns: taskStatusColumns,
    }).then(function () {
      setSaving(false);
      onClose();
    }).catch(function () {
      setSaving(false);
    });
  }

  function handleSaveAsTemplate() {
    if (!addTemplate) return;
    var tplTitle = title.trim() || "Untitled Template";
    var tplStages = stages.map(function (s) {
      return {
        title: s.title,
        sub_stages: (s.sub_stages || []).map(function (sub) { return { title: sub.title }; }),
      };
    });
    addTemplate({
      title: tplTitle,
      description: description.trim() || null,
      stages: tplStages,
      is_standing: isStanding,
      custom_field_schema: customFieldSchema,
      task_status_columns: taskStatusColumns,
    }).then(function () {
      showToast("Template saved");
    }).catch(function () {
      showToast("Couldn't save template", "error");
    });
  }

  function handleDelete() {
    if (onDelete && existing) {
      onDelete(existing.id).then(onClose);
    }
  }

  // Has supplier/shop type accounts?
  var hasSuppliers = (accounts || []).some(function (a) { return a.account_type === "supplier"; });
  var hasShops     = (accounts || []).some(function (a) { return a.account_type === "shop"; });

  var canSave = title.trim() && !(status === "blocked" && !blockedReason.trim());

  // Title label: draft editing gets "Draft Project", otherwise Edit/New
  var modalTitle = existing
    ? (existing.status === "draft" ? "Draft Project" : "Edit Project")
    : "New Project";

  return (
    <Modal title={modalTitle} onClose={onCloseRequest} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Title */}
        <div>
          <FL>Project Title *</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="What are we building?"
            autoFocus
          />
        </div>

        {/* Project mode — discrete vs standing */}
        <div>
          <FL>Project Mode</FL>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: false, label: "Discrete", hint: "Start, finish, done." },
              { id: true,  label: "Standing", hint: "Ongoing request queue." },
            ].map(function (opt) {
              var active = isStanding === opt.id;
              return (
                <button
                  key={String(opt.id)}
                  onClick={function () { setIsStanding(opt.id); }}
                  style={{
                    flex: 1,
                    background: active ? C.accentFaint : "transparent",
                    border: "1px solid " + (active ? C.accentLine : C.rule),
                    borderRadius: 6,
                    padding: "8px 10px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: active ? C.accent : C.text, marginBottom: 2 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.4 }}>
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Multi-account selector */}
        <div>
          <FL>Accounts</FL>
          {(hasSuppliers || hasShops) && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {hasSuppliers && (
                <button
                  onClick={function () { selectAllByType("supplier"); }}
                  style={{ background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: C.accent, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Select all Suppliers
                </button>
              )}
              {hasShops && (
                <button
                  onClick={function () { selectAllByType("shop"); }}
                  style={{ background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: C.accent, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Select all Shops
                </button>
              )}
              {accountIds.length > 0 && (
                <button
                  onClick={function () { setAccountIds([]); }}
                  style={{ background: "transparent", border: "1px solid " + C.rule, borderRadius: 6, padding: "3px 10px", fontSize: 11, color: C.textMuted, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <div style={{
            maxHeight: 160,
            overflowY: "auto",
            background: C.bgDark,
            border: "1px solid " + C.border,
            borderRadius: 10,
            padding: "6px 0",
          }}>
            {(accounts || []).length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: 13, color: C.textMuted }}>No accounts yet</div>
            )}
            {(accounts || []).map(function (a) {
              var checked = accountIds.indexOf(a.id) !== -1;
              return (
                <label
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 14px",
                    cursor: "pointer",
                    background: checked ? C.accentFaint : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={function () { toggleAccount(a.id); }}
                    style={{ accentColor: C.accent, width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 13, color: C.text }}>{a.name}</span>
                  {a.account_type && a.account_type !== "standard" && (
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", marginLeft: "auto" }}>{a.account_type}</span>
                  )}
                </label>
              );
            })}
          </div>
          {accountIds.length > 0 && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              {accountIds.length} account{accountIds.length !== 1 ? "s" : ""} selected
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <FL>Description</FL>
          <TextArea
            value={description}
            onChange={function (e) { setDesc(e.target.value); }}
            placeholder="Scope, goals, context..."
            rows={3}
          />
        </div>

        {/* Status + Priority */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL>Status</FL>
            <SelectField
              value={status}
              onChange={function (e) { setStatus(e.target.value); }}
            >
              {STATUS_OPTS.map(function (o) {
                return <option key={o.value} value={o.value}>{o.label}</option>;
              })}
            </SelectField>
          </div>
          <div>
            <FL>Priority</FL>
            <SelectField
              value={priority}
              onChange={function (e) { setPriority(e.target.value); }}
            >
              {PRIORITY_OPTS.map(function (o) {
                return <option key={o.value} value={o.value}>{o.label}</option>;
              })}
            </SelectField>
          </div>
        </div>

        {/* Blocked reason */}
        {status === "blocked" && (
          <div>
            <FL>Why is it blocked? *</FL>
            <TextArea
              value={blockedReason}
              onChange={function (e) { setBlockedReason(e.target.value); }}
              placeholder="What's the blocker?"
              rows={2}
              style={{ borderColor: !blockedReason.trim() ? C.red : C.border }}
            />
          </div>
        )}

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL>Start Date</FL>
            <InputField
              type="date"
              value={startDate}
              onChange={function (e) { setStartDate(e.target.value); }}
            />
          </div>
          <div>
            <FL>Due Date</FL>
            <InputField
              type="date"
              value={dueDate}
              onChange={function (e) { setDueDate(e.target.value); }}
            />
          </div>
        </div>

        {/* Scope */}
        <div>
          <FL>Project Scope</FL>
          <SelectField
            value={scope}
            onChange={function (e) { setScope(e.target.value); setAssignee(""); }}
          >
            <option value="personal">Personal — just me</option>
            <option value="team">Team — visible to my team</option>
          </SelectField>
        </div>

        {/* Assigned To — only show for team scope */}
        {scope === "team" && (
          <div>
            <FL>Assigned To</FL>
            {members && members.length > 0 ? (
              <SelectField
                value={assigneeEmail}
                onChange={function (e) { setAssignee(e.target.value); }}
              >
                <option value="">Unassigned</option>
                {members.map(function (m) {
                  return (
                    <option key={m.email || m.id} value={m.email || ""}>{memberLabel(m)}</option>
                  );
                })}
              </SelectField>
            ) : (
              <InputField
                value={assigneeEmail}
                onChange={function (e) { setAssignee(e.target.value); }}
                placeholder="Email or name"
              />
            )}
          </div>
        )}

        {/* Requested By */}
        <div>
          <FL>Requested By</FL>
          {contacts.length > 0 ? (
            <SelectField
              value={requestedBy}
              onChange={function (e) { setRequestedBy(e.target.value); }}
            >
              <option value="">Select a contact…</option>
              {contacts.map(function (c) {
                var acct = (accounts || []).find(function (a) { return a.id === c.account_id; });
                return (
                  <option key={c.id} value={c.name}>{c.name}{acct ? " (" + acct.name + ")" : ""}</option>
                );
              })}
            </SelectField>
          ) : (
            <InputField
              value={requestedBy}
              onChange={function (e) { setRequestedBy(e.target.value); }}
              placeholder="Who asked for this?"
            />
          )}
        </div>

        {/* Custom columns schema — drives the task detail panel + standing board */}
        <div>
          <FL>Task Columns</FL>
          <div style={{
            fontSize: 11, color: C.textMuted, marginBottom: 8, lineHeight: 1.5,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            Each task carries these fields. Bones defaults are pre-filled — add or remove to fit how your team intakes work.
          </div>
          {showSchemaEditor ? (
            <>
              <CustomFieldSchemaEditor schema={customFieldSchema} onChange={setCustomFieldSchema} />
              <button
                onClick={function () { setShowSchemaEditor(false); }}
                style={{
                  background: "transparent", border: "1px solid " + C.rule,
                  borderRadius: 6, padding: "4px 10px",
                  color: C.textMuted, fontSize: 11, marginTop: 6, cursor: "pointer",
                  fontFamily: MONO,
                }}
              >Done</button>
            </>
          ) : (
            <button
              onClick={function () { setShowSchemaEditor(true); }}
              style={{
                background: "transparent", border: "1px solid " + C.rule,
                borderRadius: 6, padding: "6px 12px",
                color: C.textSoft, fontSize: 11, cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Edit columns ({customFieldSchema.length})
            </button>
          )}
        </div>

        {/* Tasks (discrete only — standing manages via the board) */}
        {!isStanding && (
        <div>
          <FL>Tasks</FL>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {stages.map(function (s, i) {
              var done     = !!s.completed_at;
              var expanded = !!expandedStages[i];
              var subs     = s.sub_stages || [];
              return (
                <div key={i} style={{
                  background: C.surface2,
                  border: "1px solid " + (s.blocked_reason !== null ? C.redLine : C.rule),
                  borderRadius: 8,
                  padding: "8px 10px",
                }}>
                  {/* Stage main row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Complete toggle */}
                    <div
                      onClick={function () { toggleStage(i); }}
                      style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        background: done ? C.accent : "transparent",
                        border: "1.5px solid " + (done ? C.accent : C.rule),
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                      }}
                    >
                      {done && <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>✓</span>}
                    </div>

                    {/* Stage title */}
                    <input
                      value={s.title}
                      onChange={function (e) { updateStageField(i, "title", e.target.value); }}
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        fontSize: 13, color: done ? C.textMuted : C.text,
                        textDecoration: done ? "line-through" : "none",
                        fontFamily: "'Inter', system-ui, sans-serif",
                      }}
                    />

                    {/* External toggle */}
                    <button
                      onClick={function () { toggleExternal(i); }}
                      title="Mark as external"
                      style={{
                        background: s.is_external ? C.yellowFaint : "transparent",
                        border: "1px solid " + (s.is_external ? C.yellow : C.rule),
                        borderRadius: 4, padding: "2px 6px",
                        fontSize: 9, fontFamily: MONO,
                        color: s.is_external ? C.yellow : C.textMuted,
                        cursor: "pointer",
                      }}
                    >
                      ↗ Ext
                    </button>

                    {/* Blocked toggle */}
                    <button
                      onClick={function () { toggleStageBlocked(i); }}
                      title="Mark stage as blocked"
                      style={{
                        background: s.blocked_reason !== null ? C.redFaint : "transparent",
                        border: "1px solid " + (s.blocked_reason !== null ? C.red : C.rule),
                        borderRadius: 4, padding: "2px 6px",
                        fontSize: 9, fontFamily: MONO,
                        color: s.blocked_reason !== null ? C.red : C.textMuted,
                        cursor: "pointer",
                      }}
                    >
                      ⊘
                    </button>

                    {/* Expand sub-stages */}
                    <button
                      onClick={function () { toggleExpand(i); }}
                      style={{
                        background: "transparent", border: "none",
                        fontSize: 10, color: C.textMuted, cursor: "pointer",
                        fontFamily: MONO, padding: "2px 4px",
                      }}
                    >
                      {expanded ? "▲" : "▼"} {subs.length > 0 ? subs.length : "+"}
                    </button>

                    {/* Remove */}
                    <button
                      onClick={function () { removeStage(i); }}
                      style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Assignee row */}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                    {s.is_external ? (
                      // External: contact dropdown or free text
                      contacts.length > 0 ? (
                        <SelectField
                          value={s.external_contact_id || ""}
                          onChange={function (e) {
                            var c = contacts.find(function (x) { return x.id === e.target.value; });
                            updateStageField(i, "external_contact_id", e.target.value);
                            updateStageField(i, "external_contact_name", c ? c.name : "");
                          }}
                          style={{ fontSize: 12, padding: "4px 10px", flex: 1 }}
                        >
                          <option value="">External contact…</option>
                          {contacts.map(function (c) {
                            return <option key={c.id} value={c.id}>{c.name}</option>;
                          })}
                        </SelectField>
                      ) : (
                        <InputField
                          value={s.external_contact_name || ""}
                          onChange={function (e) { updateStageField(i, "external_contact_name", e.target.value); }}
                          placeholder="External contact name"
                          style={{ fontSize: 12, padding: "4px 10px", flex: 1 }}
                        />
                      )
                    ) : (
                      // Internal: org member dropdown
                      members && members.length > 0 ? (
                        <SelectField
                          value={s.assignee_email || ""}
                          onChange={function (e) { updateStageField(i, "assignee_email", e.target.value || null); }}
                          style={{ fontSize: 12, padding: "4px 10px", flex: 1 }}
                        >
                          <option value="">Assign to…</option>
                          {members.map(function (m) {
                            return <option key={m.email || m.id} value={m.email || ""}>{memberLabel(m)}</option>;
                          })}
                        </SelectField>
                      ) : (
                        <InputField
                          value={s.assignee_email || ""}
                          onChange={function (e) { updateStageField(i, "assignee_email", e.target.value || null); }}
                          placeholder="Assignee email"
                          style={{ fontSize: 12, padding: "4px 10px", flex: 1 }}
                        />
                      )
                    )}
                  </div>

                  {/* Stage blocked reason */}
                  {s.blocked_reason !== null && (
                    <div style={{ marginTop: 6 }}>
                      <input
                        value={s.blocked_reason}
                        onChange={function (e) { updateStageField(i, "blocked_reason", e.target.value); }}
                        placeholder="What's blocking this stage?"
                        style={{
                          width: "100%", background: C.redFaint,
                          border: "1px solid " + C.redLine,
                          borderRadius: 6, padding: "4px 8px",
                          fontSize: 12, color: C.text,
                          fontFamily: "'Inter', system-ui, sans-serif",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                  )}

                  {/* Sub-stages */}
                  {expanded && (
                    <div style={{ marginTop: 8, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 4 }}>
                      {subs.map(function (sub, j) {
                        var subDone = !!sub.completed_at;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div
                              onClick={function () { toggleSubStage(i, j); }}
                              style={{
                                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                background: subDone ? C.accentDim : "transparent",
                                border: "1.5px solid " + (subDone ? C.accent : C.rule),
                                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                              }}
                            >
                              {subDone && <span style={{ fontSize: 8, color: C.accent, fontWeight: 700 }}>✓</span>}
                            </div>
                            <input
                              value={sub.title}
                              onChange={function (e) { updateSubStageTitle(i, j, e.target.value); }}
                              style={{
                                flex: 1, background: "transparent", border: "none", outline: "none",
                                fontSize: 12, color: subDone ? C.textMuted : C.textSoft,
                                textDecoration: subDone ? "line-through" : "none",
                                fontFamily: "'Inter', system-ui, sans-serif",
                              }}
                            />
                            <button
                              onClick={function () { removeSubStage(i, j); }}
                              style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      <button
                        onClick={function () { addSubStage(i); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: C.textMuted, fontSize: 11,
                          fontFamily: "'Inter', system-ui, sans-serif",
                          textAlign: "left", padding: "2px 0",
                        }}
                      >
                        + Add sub-stage
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add stage input */}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={newStageTitle}
              onChange={function (e) { setNewStageTitle(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); addStage(); } }}
              placeholder="Add a task…"
              style={{
                flex: 1,
                background: C.bgDark,
                border: "1px solid " + C.border,
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 14,
                color: C.text,
                fontFamily: "'Inter', system-ui, sans-serif",
                outline: "none",
              }}
            />
            <button
              onClick={addStage}
              style={{
                background: C.accentFaint,
                border: "1px solid " + C.accentLine,
                borderRadius: 8,
                padding: "7px 12px",
                color: C.accent,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'Inter', system-ui, sans-serif",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>
        )}

        {isStanding && (
          <div style={{
            background: C.surface2, border: "1px solid " + C.rule, borderRadius: 8,
            padding: "10px 12px", fontSize: 12, color: C.textSoft, lineHeight: 1.5,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            This is a standing project — tasks are added on the board below as
            requests come in. Tasks landing here also surface in the assignee's
            queue.
          </div>
        )}

        {/* Draft-on-close confirmation panel */}
        {confirmDraft && (
          <div style={{
            background: C.yellowFaint,
            border: "1px solid " + C.yellow,
            borderRadius: 10,
            padding: "14px 16px",
            marginTop: 4,
          }}>
            <div style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              marginBottom: 6,
            }}>
              Save this as a draft?
            </div>
            <div style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12,
              color: C.textSoft,
              lineHeight: 1.5,
              marginBottom: 12,
            }}>
              You've started filling in this project. Save it as a draft so you can come back and finish it later.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleSaveAsDraft}
                disabled={saving}
                style={{
                  background: C.yellow,
                  border: "none",
                  borderRadius: 20,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.bg,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save as draft"}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "1px solid " + C.rule,
                  borderRadius: 20,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.textMuted,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                Discard
              </button>
              <button
                onClick={function () { setConfirmDraft(false); }}
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: 20,
                  padding: "7px 12px",
                  fontSize: 12,
                  color: C.textSoft,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                Keep editing
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {existing && !confirmDel && (
              <DangerBtn
                onClick={function () { setConfirmDel(true); }}
                style={{ fontSize: 11, padding: "6px 13px" }}
              >
                Delete
              </DangerBtn>
            )}
            {existing && confirmDel && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <DangerBtn onClick={handleDelete} style={{ fontSize: 11, padding: "6px 13px" }}>Yes</DangerBtn>
                <button
                  onClick={function () { setConfirmDel(false); }}
                  style={{
                    background: C.bgCardAlt, border: "1px solid " + C.border,
                    borderRadius: 20, padding: "6px 13px", fontSize: 11,
                    color: C.textSoft, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                  }}
                >
                  No
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {addTemplate && (
              <button
                onClick={handleSaveAsTemplate}
                style={{
                  background: "transparent",
                  border: "1px solid " + C.rule,
                  borderRadius: 20, padding: "8px 14px", fontSize: 11,
                  fontWeight: 500, color: C.textMuted,
                  fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                }}
              >
                Save as Template
              </button>
            )}
            <button
              onClick={onCloseRequest}
              style={{
                background: "none", border: "1px solid " + C.border,
                borderRadius: 20, padding: "8px 18px", fontSize: 12,
                fontWeight: 600, color: C.textSoft,
                fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                background: !canSave || saving ? C.accentFaint : C.accentDeep,
                border: "none",
                borderRadius: 20, padding: "8px 22px", fontSize: 12,
                fontWeight: 600, color: !canSave || saving ? C.textMuted : C.bg,
                fontFamily: "'Inter', system-ui, sans-serif",
                cursor: !canSave || saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : existing ? (existing.status === "draft" ? "Publish Project" : "Save Changes") : "Add Project"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
