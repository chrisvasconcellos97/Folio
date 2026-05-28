import { useState, useMemo, useRef, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";

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
  var needsAccountPicker = !accountId;
  var activeAccounts = useMemo(function () {
    return (accounts || [])
      .filter(function (a) { return !a.is_inactive; })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }, [accounts]);

  var [selectedAccountId, setSelectedAccountId] = useState(accountId || "");
  var [search, setSearch]   = useState("");
  var [pickerOpen, setPickerOpen] = useState(false);
  var [method, setMethod]   = useState("");
  var [date, setDate]       = useState(todayISO());
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var pickerRef = useRef(null);

  useEffect(function () {
    if (!pickerOpen) return;
    function onDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return function () { document.removeEventListener("mousedown", onDown); };
  }, [pickerOpen]);

  var selectedAccount = useMemo(function () {
    if (!selectedAccountId) return null;
    return activeAccounts.find(function (a) { return a.id === selectedAccountId; }) || null;
  }, [selectedAccountId, activeAccounts]);

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
    var title = "Conversation — " + formatDateLong(date);
    Promise.resolve(onStart({
      account_id:   selectedAccountId,
      user_id:      userId,
      cadence_id:   null,
      method:       method,
      meeting_date: date,
      title:        title,
      notes:        "",
      status:       "draft",
    })).then(function () {
      setLoading(false);
      // onStart owner is responsible for closing & opening meeting mode
    }).catch(function (err) {
      setLoading(false);
      setError((err && err.message) || "Couldn't start the conversation. Try again.");
    });
  }

  return (
    <Modal title="Log Conversation" onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {needsAccountPicker && (
          <div ref={pickerRef} style={{ position: "relative" }}>
            <FL htmlFor="start-conv-acct">Account</FL>
            <input
              id="start-conv-acct"
              type="text"
              value={pickerOpen || !selectedAccount ? search : selectedAccount.name}
              onChange={function (e) {
                setSearch(e.target.value);
                setPickerOpen(true);
                if (selectedAccountId) setSelectedAccountId("");
              }}
              onFocus={function () { setPickerOpen(true); }}
              placeholder="Type to search active accounts…"
              autoComplete="off"
              style={{
                width: "100%",
                background: C.bgDark,
                border: "1px solid " + C.border,
                borderRadius: 10,
                padding: "10px 14px",
                color: C.text,
                fontSize: 16,
                fontFamily: INTER,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {pickerOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                maxHeight: 240, overflowY: "auto",
                background: C.bgDropdown,
                border: "1px solid " + C.border,
                borderRadius: 10,
                boxShadow: "var(--c-overlay-shadow-md, 0 8px 24px rgba(0,0,0,0.3))",
                zIndex: 10,
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
                          setPickerOpen(false);
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <SecBtn style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancel
          </SecBtn>
          <AmberBtn style={{ flex: 1 }} onClick={handleStart} disabled={!canStart}>
            {loading ? "Starting…" : "Start Conversation →"}
          </AmberBtn>
        </div>
      </div>
    </Modal>
  );
}

export { METHOD_LABEL };
