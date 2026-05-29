import { useState, useMemo, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { useBreakpoint } from "../../hooks/useBreakpoint";

var INTER = "'Inter', system-ui, sans-serif";

var METHODS = [
  { value: "phone",     label: "Phone" },
  { value: "in_person", label: "In Person" },
  { value: "video",     label: "Video" },
  { value: "email",     label: "Email" },
];

var METHOD_LABEL = {
  phone:     "Phone",
  in_person: "In Person",
  video:     "Video",
  email:     "Email",
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatDateLong(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Pre-step modal for ad-hoc conversation logging. Creates a draft meeting and
 * hands it back to the parent via onStart — which is expected to open
 * CadenceMeetingMode for the new draft.
 *
 * Props:
 *  - accountId   — when provided, the account picker is hidden
 *  - accounts    — required when accountId is not provided; the picker filters
 *                  out inactive accounts
 *  - userId      — current user id (for the draft insert)
 *  - onStart({ account_id, method, meeting_date, title, status:'draft' })
 *               → Promise<meeting>
 *  - onClose
 */
export function StartConversationModal({ accountId, accounts, userId, onStart, onClose }) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var needsAccountPicker = !accountId;
  var activeAccounts = useMemo(function () {
    return (accounts || [])
      .filter(function (a) { return !a.is_inactive; })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }, [accounts]);

  var [selectedAccountId, setSelectedAccountId] = useState(accountId || "");
  var [search, setSearch]   = useState("");
  var [method, setMethod]   = useState("");
  var [date, setDate]       = useState(todayISO());
  var [quickNote, setQuickNote] = useState("");
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  // Email = quick after-the-fact log. Other methods = real-time meeting
  // overlay. The branch happens entirely in handleStart.
  var isQuickLog = method === "email";

  var selectedAccount = useMemo(function () {
    if (!selectedAccountId) return null;
    return activeAccounts.find(function (a) { return a.id === selectedAccountId; }) || null;
  }, [selectedAccountId, activeAccounts]);

  // Auto-select when the search narrows to exactly one match — saves a tap
  // and means the Start button doesn't sit grayed-out while the user is
  // typing what's obviously a single hit ("Ucc" → Power Auto Parts).
  useEffect(function () {
    var q = search.trim().toLowerCase();
    if (!q || selectedAccountId) return;
    var matches = activeAccounts.filter(function (a) {
      return (a.name || "").toLowerCase().includes(q);
    });
    if (matches.length === 1) {
      setSelectedAccountId(matches[0].id);
    }
  }, [search, activeAccounts, selectedAccountId]);

  var filteredAccounts = useMemo(function () {
    var q = search.trim().toLowerCase();
    if (!q) return activeAccounts.slice(0, 50);
    return activeAccounts.filter(function (a) {
      return (a.name || "").toLowerCase().indexOf(q) >= 0;
    }).slice(0, 50);
  }, [search, activeAccounts]);

  var canStart = Boolean(selectedAccountId && method && date && !loading);

  function handleStart() {
    if (!canStart) return;
    setError(null);
    setLoading(true);
    var title = isQuickLog
      ? "Email — " + formatDateLong(date)
      : "Conversation — " + formatDateLong(date);
    Promise.resolve(onStart({
      account_id:   selectedAccountId,
      user_id:      userId,
      cadence_id:   null,
      method:       method,
      meeting_date: date,
      title:        title,
      notes:        isQuickLog ? quickNote.trim() : "",
      // Email logs are after-the-fact summaries — skip the draft phase
      // entirely so they don't show up in Loose Ends. Real-time
      // conversations stay as drafts so the meeting overlay can open.
      status:       isQuickLog ? "summarized" : "draft",
    })).then(function () {
      setLoading(false);
    }).catch(function (err) {
      setLoading(false);
      setError((err && err.message) || (isQuickLog ? "Couldn't log it. Try again." : "Couldn't start the conversation. Try again."));
    });
  }

  return (
    <Modal title="Log Conversation" onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {needsAccountPicker && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <FL htmlFor="start-conv-acct">Account</FL>
              {selectedAccount ? (
                <span style={{ fontSize: 10.5, color: C.accent, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  ✓ {selectedAccount.name}
                </span>
              ) : (
                <span style={{ fontSize: 10.5, color: C.textMuted, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {search.trim() ? filteredAccounts.length + " of " + activeAccounts.length : activeAccounts.length + " accounts"}
                </span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="start-conv-acct"
                type="text"
                value={search}
                onChange={function (e) {
                  setSearch(e.target.value);
                  if (selectedAccountId) setSelectedAccountId("");
                }}
                placeholder={selectedAccount ? selectedAccount.name : "Type an account name…"}
                autoComplete="off"
                style={{
                  width: "100%",
                  background: C.bgDark,
                  border: "1px solid " + (selectedAccount ? C.accentBorder : C.border),
                  borderRadius: 10,
                  padding: "10px 36px 10px 14px",
                  color: C.text,
                  fontSize: 16,
                  fontFamily: INTER,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {(search || selectedAccount) && (
                <button
                  type="button"
                  onClick={function () { setSearch(""); setSelectedAccountId(""); }}
                  aria-label="Clear account"
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", color: C.textMuted,
                    fontSize: 18, lineHeight: 1, padding: "4px 8px", cursor: "pointer",
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {!selectedAccount && (
              <div style={{
                marginTop: 6,
                maxHeight: 200, overflowY: "auto",
                background: C.bgDropdown,
                border: "1px solid " + C.border,
                borderRadius: 10,
              }}>
                {filteredAccounts.length === 0 ? (
                  <div style={{ padding: "10px 14px", fontSize: 12, color: C.textMuted, fontFamily: INTER }}>
                    No matches.
                  </div>
                ) : (
                  filteredAccounts.map(function (a) {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={function () {
                          setSelectedAccountId(a.id);
                          setSearch("");
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: "9px 14px",
                          color: C.text, fontSize: 13, fontFamily: INTER,
                          cursor: "pointer",
                        }}
                      >
                        {a.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <FL>Method</FL>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 6 }}>
            {METHODS.map(function (m) {
              var active = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={function () { setMethod(m.value); }}
                  style={{
                    background: active ? C.accentMid : "var(--c-input-fill)",
                    border: "1px solid " + (active ? C.accentBorder : C.border),
                    borderRadius: 8,
                    padding: "9px 10px",
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    color: active ? C.accent : C.textMuted,
                    fontFamily: INTER,
                    cursor: "pointer",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FL htmlFor="start-conv-date">Date</FL>
          <InputField
            id="start-conv-date"
            type="date"
            value={date}
            onChange={function (e) { setDate(e.target.value); }}
          />
        </div>

        {isQuickLog && (
          <div>
            <FL htmlFor="start-conv-note">
              What was it about? <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
            </FL>
            <TextArea
              id="start-conv-note"
              value={quickNote}
              onChange={function (e) { setQuickNote(e.target.value); }}
              placeholder="One or two lines — 'Adam confirmed deck, asked for follow-up Tue.'"
              rows={3}
              autoFocus
            />
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: C.redFaint,
              border: "1px solid " + C.redLine,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: C.red,
            }}
          >
            {error}
          </div>
        )}

        {!canStart && !loading && (
          <div style={{
            fontFamily: INTER, fontSize: 11.5, color: C.textMuted,
            marginTop: -4, marginBottom: -4, textAlign: "right",
          }}>
            {!selectedAccountId ? "Pick an account from the list to start."
              : !method ? "Pick a method to start."
              : !date ? "Pick a date to start."
              : ""}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <SecBtn style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancel
          </SecBtn>
          <AmberBtn style={{ flex: 1 }} onClick={handleStart} disabled={!canStart}>
            {loading
              ? (isQuickLog ? "Logging…" : "Starting…")
              : (isQuickLog ? "Log it" : "Start Conversation →")}
          </AmberBtn>
        </div>
      </div>
    </Modal>
  );
}

export { METHOD_LABEL };
