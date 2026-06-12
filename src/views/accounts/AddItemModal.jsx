import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn, DangerBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { PersonPicker } from "../../components/PersonPicker";
import { useContacts } from "../../hooks/useContacts";
import { relUpdateTime, updateAuthorLabel } from "../gauge/ProjectStatusUpdate";
import { showToast } from "../../components/Toast";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

export function AddItemModal({ accountId, userId, userEmail, existing, onSave, onDelete, onClose, members, accounts }) {
  var contactsApi = useContacts(userId, accountId);
  var isEdit = !!existing;

  var [text, setText]                   = useState(existing ? (existing.text || "") : "");
  var [due, setDue]                     = useState(existing ? (existing.due_date || "") : "");
  var [owner, setOwner]                 = useState(existing ? (existing.owner || "") : "");
  var [recipient, setRecipient]         = useState(existing ? (existing.recipient || "") : "");
  var [waitingOn, setWaitingOn]         = useState(existing ? (existing.waiting_on || "") : "");
  var [isCommitment, setIsCommitment]   = useState(existing ? !!existing.is_commitment : false);
  var [statusUpdates, setStatusUpdates] = useState(existing ? (Array.isArray(existing.status_updates) ? existing.status_updates : []) : []);
  var [draftUpdate, setDraftUpdate]     = useState("");
  var [postingSaving, setPostingSaving] = useState(false);
  var [confirmDelete, setConfirmDelete] = useState(false);
  var [loading, setLoading]             = useState(false);
  var [error, setError]                 = useState(null);

  function postUpdate() {
    var body = draftUpdate.trim();
    if (!body || postingSaving || !existing) return;
    setPostingSaving(true);
    var entry = { body: body, at: new Date().toISOString(), by: userEmail || null };
    var next = [entry].concat(statusUpdates);
    onSave(existing.id, { status_updates: next })
      .then(function () {
        setStatusUpdates(next);
        setDraftUpdate("");
        setPostingSaving(false);
        showToast("Update posted");
      })
      .catch(function (err) {
        setPostingSaving(false);
        showToast(err.message || "Couldn't post update", "error");
      });
  }

  function handleSave() {
    if (!text.trim()) { setError("Description is required."); return; }
    setLoading(true);
    setError(null);
    var data = {
      text:     text.trim(),
      due_date: due || null,
      owner:    owner.trim() || null,
    };
    if (isEdit) {
      var prevWaiting = existing.waiting_on || "";
      var newWaiting  = waitingOn.trim();
      data.recipient       = recipient.trim() || null;
      data.waiting_on      = newWaiting || null;
      data.waiting_on_since = newWaiting
        ? (newWaiting !== prevWaiting ? new Date().toISOString().split("T")[0] : (existing.waiting_on_since || null))
        : null;
      data.is_commitment   = isCommitment;
      data.status_updates  = statusUpdates;
    }
    var promise = isEdit
      ? onSave(existing.id, data)
      : onSave(Object.assign({ account_id: accountId, user_id: userId }, data));
    promise
      .then(function () { setLoading(false); onClose(); })
      .catch(function (err) { setLoading(false); setError(err.message); });
  }

  function handleDelete() {
    if (!onDelete || !existing) return;
    onDelete(existing.id)
      .then(function () { showToast("Task deleted"); onClose(); })
      .catch(function (err) { showToast(err.message || "Couldn't delete", "error"); });
  }

  var latest = statusUpdates[0] || null;

  return (
    <Modal title={isEdit ? "Edit Task" : "Add Open Item"} onClose={onClose} width={isEdit ? 480 : 400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        <div>
          <FL htmlFor="item-description">Description</FL>
          <InputField
            id="item-description"
            value={text}
            onChange={function (e) { setText(e.target.value); }}
            placeholder="What needs to happen?"
          />
        </div>

        <div>
          <FL htmlFor="item-due-date">Due Date</FL>
          <InputField
            id="item-due-date"
            type="date"
            value={due}
            onChange={function (e) { setDue(e.target.value); }}
          />
        </div>

        <div>
          <FL>Owner</FL>
          <PersonPicker
            value={owner}
            onChange={function (v) { setOwner(v || ""); }}
            members={members}
            contacts={contactsApi.contacts}
            accounts={accounts}
            accountIds={accountId ? [accountId] : []}
            noneLabel="Unassigned"
          />
        </div>

        {isEdit && (
          <>
            <div>
              <FL>Recipient</FL>
              <PersonPicker
                value={recipient}
                onChange={function (v) { setRecipient(v || ""); }}
                members={members}
                contacts={contactsApi.contacts}
                accounts={accounts}
                accountIds={accountId ? [accountId] : []}
                noneLabel="None"
              />
            </div>

            <div>
              <FL>Waiting On</FL>
              <PersonPicker
                value={waitingOn}
                onChange={function (v) { setWaitingOn(v || ""); }}
                members={members}
                contacts={contactsApi.contacts}
                accounts={accounts}
                accountIds={accountId ? [accountId] : []}
                noneLabel="Not blocked"
              />
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={function () { setIsCommitment(function (v) { return !v; }); }}
              onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") setIsCommitment(function (v) { return !v; }); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "9px 12px", borderRadius: 8,
                background: isCommitment ? C.accentFaint : C.surface2,
                border: "1px solid " + (isCommitment ? C.accentLine : C.rule),
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: 16, color: isCommitment ? C.accent : C.textMuted }}>
                {isCommitment ? "✦" : "◇"}
              </span>
              <span style={{ fontFamily: INTER, fontSize: 13, color: isCommitment ? C.accent : C.text }}>
                {isCommitment ? "Marked as commitment" : "Mark as commitment"}
              </span>
            </div>

            {/* Status updates pulse log */}
            <div>
              <div style={{
                fontFamily: MONO, fontSize: 9.5, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
              }}>
                Status Updates
              </div>

              {latest ? (
                <div style={{
                  background: C.surface2, border: "1px solid " + C.rule,
                  borderLeft: "2px solid " + C.accent, borderRadius: 8,
                  padding: "8px 11px", marginBottom: 8,
                }}>
                  <div style={{ fontFamily: INTER, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    {latest.body}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginTop: 4, letterSpacing: "0.04em" }}>
                    {relUpdateTime(latest.at)}
                    {latest.by ? " · " + updateAuthorLabel(latest.by) : ""}
                    {statusUpdates.length > 1 ? " · " + statusUpdates.length + " total" : ""}
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: INTER, fontSize: 12, color: C.textMuted, marginBottom: 8, fontStyle: "italic" }}>
                  No updates yet.
                </div>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <textarea
                  value={draftUpdate}
                  onChange={function (e) { setDraftUpdate(e.target.value); }}
                  onKeyDown={function (e) {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postUpdate(); }
                  }}
                  placeholder="Post an update… (Enter to post)"
                  rows={1}
                  style={{
                    flex: 1, background: C.surface2, border: "1px solid " + C.rule,
                    borderRadius: 8, padding: "8px 11px", color: C.text, fontSize: 13,
                    lineHeight: 1.5, fontFamily: INTER, resize: "vertical", outline: "none",
                    boxSizing: "border-box", minHeight: 38,
                  }}
                />
                <button
                  type="button"
                  onClick={postUpdate}
                  disabled={!draftUpdate.trim() || postingSaving}
                  style={{
                    background: draftUpdate.trim() ? C.accentFaint : "transparent",
                    border: "1px solid " + (draftUpdate.trim() ? C.accentLine : C.rule),
                    borderRadius: 8, padding: "8px 14px",
                    color: draftUpdate.trim() ? C.accent : C.textMuted,
                    fontFamily: INTER, fontSize: 13, fontWeight: 600,
                    cursor: draftUpdate.trim() && !postingSaving ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {postingSaving ? "Posting…" : "Post"}
                </button>
              </div>

              {statusUpdates.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 9, color: C.textMuted,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
                  }}>
                    History ({statusUpdates.length - 1} older)
                  </div>
                  {statusUpdates.slice(1).map(function (u, i) {
                    return (
                      <div key={i} style={{
                        padding: "6px 10px", borderRadius: 6, marginBottom: 4,
                        background: C.surface2, border: "1px solid " + C.rule, opacity: 0.7,
                      }}>
                        <div style={{ fontFamily: INTER, fontSize: 12, color: C.text, lineHeight: 1.4 }}>{u.body}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                          {relUpdateTime(u.at)}{u.by ? " · " + updateAuthorLabel(u.by) : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div role="alert" aria-live="polite" style={{
            background: C.redFaint, border: "1px solid " + C.redLine,
            borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Item"}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>

        {isEdit && onDelete && (
          <div style={{ marginTop: 2 }}>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={function () { setConfirmDelete(true); }}
                style={{
                  width: "100%", background: "none", border: "1px solid " + C.rule,
                  borderRadius: 8, padding: "7px", fontFamily: INTER, fontSize: 12,
                  color: C.textMuted, cursor: "pointer",
                }}
              >
                Delete task
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <DangerBtn style={{ flex: 1 }} onClick={handleDelete}>Yes, delete</DangerBtn>
                <SecBtn style={{ flex: 1 }} onClick={function () { setConfirmDelete(false); }}>Keep it</SecBtn>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
