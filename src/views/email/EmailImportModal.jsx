import { useState, useMemo } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { callEmailImportPip } from "../../lib/pip";
import { applyEmailImport } from "../../lib/emailImportApply";
import { useItems } from "../../hooks/useItems";
import { useEmailThreads } from "../../hooks/useEmailThreads";
import { tokenSetRatio } from "../../lib/threadKey";
import { logActivity } from "../../lib/activity";
import { supabase } from "../../lib/supabase";
import { touchAccount } from "../../lib/touchAccount";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

var ACTION_TYPE_LABELS = {
  action:        { label: "ACTION",       color: C.blue },
  committed:     { label: "COMMITMENT ✦", color: C.accent },
  waiting:       { label: "WAITING",      color: C.yellow },
  still_waiting: { label: "WAITING",      color: C.yellow },
  logged:        { label: "LOGGED",       color: C.textMuted },
  update:        { label: "UPDATE",       color: C.blue },
};

function ActionPill({ type }) {
  var info = ACTION_TYPE_LABELS[type] || { label: (type || "").toUpperCase(), color: C.textMuted };
  return (
    <span style={{
      display: "inline-block",
      fontFamily: MONO, fontSize: 9, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase",
      color: info.color,
      border: "1px solid " + info.color,
      borderRadius: 4, padding: "1px 5px",
      flexShrink: 0,
    }}>
      {info.label}
    </span>
  );
}

function ThreadRow({ thread, onChange }) {
  var [summary, setSummary]   = useState(thread.summary || "");
  var [dueDate, setDueDate]   = useState(thread.due_date || "");
  var checked = thread._selected !== false;

  function handleToggle() { onChange(Object.assign({}, thread, { _selected: !checked })); }
  function handleSummaryBlur() { onChange(Object.assign({}, thread, { summary: summary })); }
  function handleDueChange(e) {
    var v = e.target.value;
    setDueDate(v);
    onChange(Object.assign({}, thread, { due_date: v || null }));
  }

  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: "8px 0", borderBottom: "1px solid " + C.ruleSoft,
      opacity: checked ? 1 : 0.45,
    }}>
      <div
        role="checkbox"
        aria-checked={checked}
        onClick={handleToggle}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
          border: "1.5px solid " + (checked ? C.accent : C.rule),
          background: checked ? C.accent : "transparent",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <span style={{ color: C.bg, fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <ActionPill type={thread.action_type} />
          <span style={{
            fontFamily: MONO, fontSize: 11, color: C.textSoft,
            fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            "{thread.subject_raw || "(no subject)"}"
          </span>
          {thread.contact_name_raw && (
            <span style={{ fontFamily: INTER, fontSize: 11, color: C.textMuted }}>· {thread.contact_name_raw}</span>
          )}
          {thread._existingThreadId && (
            <span style={{
              fontFamily: MONO, fontSize: 9, color: C.accent,
              border: "1px solid " + C.accentLine, borderRadius: 4, padding: "1px 5px",
            }}>↗ links to existing</span>
          )}
        </div>
        <textarea
          value={summary}
          onChange={function (e) { setSummary(e.target.value); }}
          onBlur={handleSummaryBlur}
          placeholder="Summary…"
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.surface2, border: "1px solid " + C.rule,
            borderRadius: 6, padding: "6px 8px",
            fontFamily: INTER, fontSize: 13, color: C.text, lineHeight: 1.5,
            resize: "vertical",
          }}
        />
        {(thread.action_type === "action" || thread.action_type === "committed") && (
          <div style={{ marginTop: 4 }}>
            <input
              type="date"
              value={dueDate}
              onChange={handleDueChange}
              style={{
                background: C.surface2, border: "1px solid " + C.rule,
                borderRadius: 5, padding: "4px 8px",
                fontFamily: INTER, fontSize: 13, color: dueDate ? C.text : C.textMuted,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ContactRow({ contact, onChange }) {
  var [email, setEmail] = useState(contact.email || "");
  var checked = contact._selected !== false;
  function handleToggle() { onChange(Object.assign({}, contact, { _selected: !checked })); }
  function handleEmailBlur() { onChange(Object.assign({}, contact, { email: email })); }
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "center",
      padding: "6px 0", borderBottom: "1px solid " + C.ruleSoft,
      opacity: checked ? 1 : 0.45,
    }}>
      <div
        role="checkbox"
        aria-checked={checked}
        onClick={handleToggle}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: "1.5px solid " + (checked ? C.accent : C.rule),
          background: checked ? C.accent : "transparent",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <span style={{ color: C.bg, fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: INTER, fontSize: 13, color: C.text, fontWeight: 600 }}>{contact.name}</span>
        {contact.account_name_raw && (
          <span style={{
            fontFamily: MONO, fontSize: 10, color: C.accent,
            border: "1px solid " + C.accentLine, borderRadius: 4, padding: "1px 5px",
          }}>{contact.account_name_raw}</span>
        )}
        <input
          type="email"
          value={email}
          onChange={function (e) { setEmail(e.target.value); }}
          onBlur={handleEmailBlur}
          placeholder="email (optional)"
          style={{
            background: C.surface2, border: "1px solid " + C.rule,
            borderRadius: 5, padding: "4px 8px",
            fontFamily: INTER, fontSize: 13, color: C.text,
          }}
        />
      </div>
    </div>
  );
}

export function EmailImportModal({ open, onClose, userId, orgId, accounts, contacts }) {
  var [step, setStep]           = useState("paste");
  var [pasteText, setPasteText] = useState("");
  var [parsing, setParsing]     = useState(false);
  var [plan, setPlan]           = useState(null);
  var [applying, setApplying]   = useState(false);

  var { threads: openThreads } = useEmailThreads(userId);
  var { addItem } = useItems(userId, null, orgId);

  var openThreadsMini = useMemo(function () {
    return (openThreads || [])
      .filter(function (t) { return t.status === "open" || t.status === "waiting"; })
      .slice(0, 100)
      .map(function (t) { return { id: t.id, subjectNorm: t.subject_norm, accountId: t.account_id }; });
  }, [openThreads]);

  var accountsMini = useMemo(function () {
    return (accounts || []).filter(function (a) { return !a.is_inactive; }).map(function (a) { return { id: a.id, name: a.name }; });
  }, [accounts]);

  var contactsMini = useMemo(function () {
    return (contacts || []).map(function (c) { return { id: c.id, name: c.name, email: c.email, accountId: c.account_id }; });
  }, [contacts]);

  function handleParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    callEmailImportPip({
      text:        pasteText,
      accounts:    accountsMini,
      contacts:    contactsMini,
      openThreads: openThreadsMini,
    }).then(function (result) {
      setParsing(false);
      if (!result || result.empty) {
        showToast("Pip didn't find any emails to parse — check the format.", "info");
        return;
      }
      var planWithSel = Object.assign({}, result, {
        contacts: (result.contacts || []).map(function (c) {
          return Object.assign({}, c, { _selected: c.match === "none" });
        }),
        accounts: (result.accounts || []).map(function (acct) {
          return Object.assign({}, acct, {
            threads: (acct.threads || []).map(function (t) {
              var fuzzyMatch = openThreadsMini.find(function (ot) {
                return ot.accountId === acct.account_id && tokenSetRatio(ot.subjectNorm, t.subject_raw || "") >= 0.8;
              });
              return Object.assign({}, t, {
                _selected: true,
                _existingThreadId: fuzzyMatch ? fuzzyMatch.id : null,
              });
            }),
          });
        }),
      });
      setPlan(planWithSel);
      setStep("preview");
    }).catch(function (err) {
      setParsing(false);
      showToast("Pip couldn't read this roundup: " + (err && err.message || "unknown error"), "error");
    });
  }

  function updateContact(idx, updated) {
    setPlan(function (prev) {
      var newContacts = prev.contacts.slice();
      newContacts[idx] = updated;
      return Object.assign({}, prev, { contacts: newContacts });
    });
  }

  function updateThread(acctIdx, threadIdx, updated) {
    setPlan(function (prev) {
      var newAccounts = prev.accounts.slice();
      var acct = Object.assign({}, newAccounts[acctIdx]);
      var newThreads = acct.threads.slice();
      newThreads[threadIdx] = updated;
      acct.threads = newThreads;
      newAccounts[acctIdx] = acct;
      return Object.assign({}, prev, { accounts: newAccounts });
    });
  }

  var rollup = useMemo(function () {
    if (!plan) return { contacts: 0, tasks: 0, commitments: 0, logged: 0, waiting: 0 };
    var counts = { contacts: 0, tasks: 0, commitments: 0, logged: 0, waiting: 0 };
    (plan.contacts || []).forEach(function (c) { if (c._selected !== false && c.match === "none") counts.contacts++; });
    (plan.accounts || []).forEach(function (a) {
      (a.threads || []).forEach(function (t) {
        if (t._selected === false) return;
        if (t.action_type === "committed") counts.commitments++;
        else if (t.action_type === "action") counts.tasks++;
        else if (t.action_type === "logged") counts.logged++;
        else if (t.action_type === "waiting" || t.action_type === "still_waiting") counts.waiting++;
      });
    });
    return counts;
  }, [plan]);

  var unrecognizedAccounts = useMemo(function () {
    if (!plan) return [];
    return (plan.accounts || []).filter(function (a) { return !a.account_id; });
  }, [plan]);

  function handleApply() {
    if (!plan) return;
    setApplying(true);

    var accountById = {};
    (accounts || []).forEach(function (a) { accountById[a.id] = a; });

    applyEmailImport(plan, userId, orgId, {
      addItem:     addItem,
      supabase:    supabase,
      logActivity: logActivity,
      touchAccount: touchAccount,
    }).then(function (result) {
      setApplying(false);
      var c = result.created;
      var parts = [];
      if (c.contacts.length) parts.push(c.contacts.length + " contact" + (c.contacts.length > 1 ? "s" : ""));
      if (c.tasks.length) parts.push(c.tasks.length + " task" + (c.tasks.length > 1 ? "s" : ""));
      if (c.threads.length) parts.push(c.threads.length + " thread" + (c.threads.length > 1 ? "s" : ""));
      showToast("Roundup filed" + (parts.length ? ": " + parts.join(", ") : "") + ".");
      onClose();
      setPasteText("");
      setPlan(null);
      setStep("paste");
    }).catch(function (err) {
      setApplying(false);
      showToast("Couldn't apply — " + (err && err.message || "check your connection"), "error");
    });
  }

  function handleClose() {
    onClose();
    setPasteText("");
    setPlan(null);
    setStep("paste");
  }

  var applyLabel = useMemo(function () {
    if (!plan) return "Apply";
    var total = rollup.tasks + rollup.commitments + rollup.logged + rollup.waiting;
    return "Apply " + total + " change" + (total !== 1 ? "s" : "");
  }, [plan, rollup]);

  var rollupLine = useMemo(function () {
    var parts = [];
    if (rollup.contacts)    parts.push(rollup.contacts + " contact" + (rollup.contacts > 1 ? "s" : ""));
    if (rollup.tasks)       parts.push(rollup.tasks + " task" + (rollup.tasks > 1 ? "s" : ""));
    if (rollup.commitments) parts.push(rollup.commitments + " commitment" + (rollup.commitments > 1 ? "s" : ""));
    if (rollup.logged)      parts.push(rollup.logged + " logged");
    if (rollup.waiting)     parts.push(rollup.waiting + " waiting");
    return parts.join(", ");
  }, [rollup]);

  return (
    <Modal open={open} onClose={handleClose} title="Import Email Roundup">
      {step === "paste" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted }}>
            Pip reads your email roundup and files everything for you.
          </div>
          <textarea
            value={pasteText}
            onChange={function (e) { setPasteText(e.target.value); }}
            placeholder="Paste your email roundup here"
            style={{
              width: "100%", boxSizing: "border-box",
              minHeight: 200, maxHeight: 420,
              background: C.surface2, border: "1px solid " + C.rule,
              borderRadius: 8, padding: "12px 14px",
              fontFamily: INTER, fontSize: 16, color: C.text, lineHeight: 1.6,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "none", border: "1px solid " + C.rule, borderRadius: 7,
                padding: "8px 16px", fontFamily: INTER, fontSize: 13,
                color: C.textMuted, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleParse}
              disabled={!pasteText.trim() || parsing}
              style={{
                background: C.accentDeep, border: "1px solid " + C.accent,
                borderRadius: 7, padding: "8px 18px",
                fontFamily: INTER, fontSize: 13, fontWeight: 600,
                color: C.bg, cursor: pasteText.trim() && !parsing ? "pointer" : "not-allowed",
                opacity: pasteText.trim() && !parsing ? 1 : 0.5,
              }}
            >
              {parsing ? "Pip is reading…" : "Parse with Pip ✦"}
            </button>
          </div>
        </div>
      )}

      {step === "preview" && plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(plan.contacts || []).filter(function (c) { return c.match === "none"; }).length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                New people Pip spotted ({(plan.contacts || []).filter(function (c) { return c.match === "none"; }).length})
              </div>
              {(plan.contacts || []).map(function (c, i) {
                if (c.match !== "none") return null;
                return <ContactRow key={i} contact={c} onChange={function (updated) { updateContact(i, updated); }} />;
              })}
            </div>
          )}

          {(plan.accounts || []).filter(function (a) { return a.account_id; }).map(function (acct, ai) {
            var confidence = acct.match_confidence || "high";
            var acctObj = (accounts || []).find(function (a) { return a.id === acct.account_id; });
            return (
              <div key={ai} style={{ border: "1px solid " + C.rule, borderRadius: 10, overflow: "hidden" }}>
                <div style={{
                  background: C.surface2, padding: "10px 14px",
                  display: "flex", gap: 8, alignItems: "center",
                  borderBottom: "1px solid " + C.rule,
                }}>
                  <span style={{
                    fontFamily: INTER, fontSize: 13, fontWeight: 700,
                    color: confidence === "high" ? C.green : C.yellow,
                  }}>
                    {confidence === "high" ? "✓ " : "~ "}
                    {acctObj ? acctObj.name : acct.account_name_raw}
                  </span>
                  {acct.threads && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                      {acct.threads.length} thread{acct.threads.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div style={{ padding: "0 14px" }}>
                  {(acct.threads || []).map(function (t, ti) {
                    var origAi = (plan.accounts || []).findIndex(function (a) { return a.account_id === acct.account_id; });
                    return (
                      <ThreadRow
                        key={ti}
                        thread={t}
                        onChange={function (updated) { updateThread(origAi, ti, updated); }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {unrecognizedAccounts.length > 0 && (
            <details style={{ border: "1px solid " + C.yellow, borderRadius: 8, padding: "10px 14px" }}>
              <summary style={{ fontFamily: INTER, fontSize: 12, color: C.yellow, cursor: "pointer", fontWeight: 600 }}>
                Pip couldn't match these accounts — items skipped ({unrecognizedAccounts.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {unrecognizedAccounts.map(function (a, i) {
                  return (
                    <div key={i} style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, padding: "2px 0" }}>
                      {a.account_name_raw}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <div style={{
            background: C.surface2, border: "1px solid " + C.rule,
            borderRadius: 10, padding: "12px 14px",
            display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap",
          }}>
            <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted }}>
              {rollupLine || "Nothing selected"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: "none", border: "1px solid " + C.rule, borderRadius: 7,
                  padding: "7px 14px", fontFamily: INTER, fontSize: 13,
                  color: C.textMuted, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                style={{
                  background: C.accentDeep, border: "1px solid " + C.accent,
                  borderRadius: 7, padding: "7px 18px",
                  fontFamily: INTER, fontSize: 13, fontWeight: 600,
                  color: C.bg, cursor: applying ? "not-allowed" : "pointer",
                  opacity: applying ? 0.6 : 1,
                }}
              >
                {applying ? "Applying…" : applyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
