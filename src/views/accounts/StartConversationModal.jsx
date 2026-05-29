import { useState, useMemo, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useContacts } from "../../hooks/useContacts";
import { extractTouchpointActionsPip } from "../../lib/pip";
import { showToast } from "../../components/Toast";
import { useAutoBullet } from "../../lib/useAutoBullet";

var BULLET_KEY = "folio_autobullet_quick_capture";

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
export function StartConversationModal({ accountId, accounts, userId, orgId, members, onStart, onAddItems, onClose }) {
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
  var [bulletsOn, setBulletsOn] = useState(function () {
    try { var v = localStorage.getItem(BULLET_KEY); return v === null ? true : v === "1"; } catch (e) { return true; }
  });
  useEffect(function () {
    try { localStorage.setItem(BULLET_KEY, bulletsOn ? "1" : "0"); } catch (e) {}
  }, [bulletsOn]);
  var bulletProps = useAutoBullet({ value: quickNote, onChange: setQuickNote, enabled: bulletsOn });
  var [withContacts, setWithContacts] = useState([]); // contact names
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  // Action item extraction state — drives the in-place "review" phase
  // after the user clicks Log it.
  var [phase, setPhase]                 = useState("compose"); // compose | extracting | review | saving
  var [extractedItems, setExtractedItems] = useState([]); // [{ text, due_date, assignee, confidence, checked }]
  var [extractedTitle, setExtractedTitle] = useState(""); // Pip's 3-4 word short title for the touchpoint

  // Email = quick after-the-fact log. Other methods = real-time meeting
  // overlay. The branch happens entirely in handleStart.
  var isQuickLog = method === "email";

  // Load contacts when an account is picked — only needed for the quick-log
  // flow (contact chip selector + Pip extraction context).
  var contactsApi = useContacts(userId, selectedAccountId || null, orgId);
  var accountContacts = contactsApi.contacts || [];

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

  function commitLog(itemsToCreate, shortTitleOverride) {
    setError(null);
    setPhase("saving");
    setLoading(true);
    var title = isQuickLog
      ? "Email — " + formatDateLong(date)
      : "Conversation — " + formatDateLong(date);
    var pipShortTitle = isQuickLog
      ? (shortTitleOverride || extractedTitle || "")
      : "";
    return Promise.resolve(onStart({
      account_id:      selectedAccountId,
      user_id:         userId,
      cadence_id:      null,
      method:          method,
      meeting_date:    date,
      title:           title,
      notes:           isQuickLog ? quickNote.trim() : "",
      attendees:       withContacts.length > 0 ? withContacts.slice() : null,
      pip_short_title: pipShortTitle || null,
      status:          isQuickLog ? "summarized" : "draft",
    })).then(function () {
      if (isQuickLog && itemsToCreate && itemsToCreate.length > 0 && onAddItems) {
        return onAddItems(selectedAccountId, itemsToCreate);
      }
      return null;
    }).then(function () {
      setLoading(false);
      // Real-time conversations: the parent handles the close + adHoc
      // overlay mount via onStart. Quick logs close themselves here.
      if (isQuickLog) {
        var n = (itemsToCreate || []).length;
        showToast(n > 0 ? "Logged — added " + n + " item" + (n !== 1 ? "s" : "") + "." : "Logged.");
        if (onClose) onClose();
      }
    }).catch(function (err) {
      setLoading(false);
      setPhase(isQuickLog && extractedItems.length > 0 ? "review" : "compose");
      setError((err && err.message) || (isQuickLog ? "Couldn't log it. Try again." : "Couldn't start the conversation. Try again."));
    });
  }

  function handleStart() {
    if (!canStart) return;
    // For real-time conversations (phone / in_person / video), skip the
    // extractor entirely — those open the meeting overlay where the
    // existing summarize flow already handles action items.
    if (!isQuickLog) {
      commitLog(null);
      return;
    }
    var note = quickNote.trim();
    if (!note) {
      // Empty note → no extraction, just save.
      commitLog(null);
      return;
    }
    setError(null);
    setPhase("extracting");
    setLoading(true);
    extractTouchpointActionsPip({
      note:        note,
      accountName: selectedAccount ? selectedAccount.name : "",
      contacts:    withContacts.map(function (n) { return { name: n }; }),
      orgMembers:  members || [],
    }).then(function (result) {
      var items = (result && result.items) || [];
      var title = (result && result.short_title) || "";
      setExtractedTitle(title);
      setLoading(false);
      if (items.length === 0) {
        // Nothing to confirm — save straight through.
        commitLog(null, title);
        return;
      }
      // High + medium default to checked. Low confidence starts unchecked.
      var prepared = items.map(function (it) {
        return {
          text:        it.text,
          due_date:    it.due_date || "",
          assignee:    it.suggested_assignee || "",
          confidence:  it.confidence || "medium",
          checked:     it.confidence !== "low",
        };
      });
      setExtractedItems(prepared);
      setPhase("review");
    }).catch(function () {
      // If the extractor fails, fall back to saving without items.
      setLoading(false);
      commitLog(null);
    });
  }

  function handleSaveReviewed() {
    var checkedItems = extractedItems
      .filter(function (it) { return it.checked && (it.text || "").trim(); })
      .map(function (it) {
        return {
          text:     it.text.trim(),
          due_date: it.due_date || null,
          owner:    it.assignee || null,
        };
      });
    commitLog(checkedItems);
  }

  function toggleItem(idx) {
    setExtractedItems(function (prev) {
      return prev.map(function (it, i) { return i === idx ? Object.assign({}, it, { checked: !it.checked }) : it; });
    });
  }
  function editItem(idx, key, val) {
    setExtractedItems(function (prev) {
      return prev.map(function (it, i) { return i === idx ? Object.assign({}, it, { [key]: val }) : it; });
    });
  }
  function toggleContact(name) {
    setWithContacts(function (prev) {
      return prev.indexOf(name) >= 0 ? prev.filter(function (n) { return n !== name; }) : prev.concat([name]);
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

        {isQuickLog && selectedAccountId && accountContacts.length > 0 && phase === "compose" && (
          <div>
            <FL>
              Who was it with? <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
            </FL>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {accountContacts.map(function (c) {
                var active = withContacts.indexOf(c.name) >= 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={function () { toggleContact(c.name); }}
                    style={{
                      background: active ? C.accentFaint : "transparent",
                      color: active ? C.accent : C.textSoft,
                      border: "1px solid " + (active ? C.accentBorder : C.rule),
                      borderRadius: 999,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      fontFamily: INTER,
                      cursor: "pointer",
                    }}
                  >
                    {active ? "✓ " : ""}{c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isQuickLog && phase === "compose" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <FL htmlFor="start-conv-note">
                What was it about? <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
              </FL>
              <button
                type="button"
                onClick={function () { setBulletsOn(function (v) { return !v; }); }}
                aria-pressed={bulletsOn}
                title="Auto-bullet new lines"
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 9.5,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  background: bulletsOn ? C.accentFaint : "transparent",
                  color: bulletsOn ? C.accent : C.textMuted,
                  border: "1px solid " + (bulletsOn ? C.accentLine : C.rule),
                  borderRadius: 999, padding: "3px 10px",
                  cursor: "pointer", flexShrink: 0,
                  marginBottom: 4,
                }}
              >
                • Bullets {bulletsOn ? "on" : "off"}
              </button>
            </div>
            <TextArea
              id="start-conv-note"
              value={quickNote}
              onChange={function (e) { setQuickNote(e.target.value); }}
              onKeyDown={bulletProps.onKeyDown}
              onFocus={bulletProps.onFocus}
              onPaste={bulletProps.onPaste}
              placeholder="One or two lines — 'Adam confirmed deck, asked for follow-up Tue.'"
              rows={3}
              autoFocus
            />
          </div>
        )}

        {phase === "extracting" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px",
            background: C.accentGlow, border: "1px solid " + C.accentLine,
            borderRadius: 10,
            fontFamily: INTER, fontSize: 13, color: C.accent, fontWeight: 600,
          }}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: C.accent, animation: "pip-breathe 1.4s ease-in-out infinite",
            }} />
            Pip's reading…
          </div>
        )}

        {phase === "review" && extractedItems.length > 0 && (
          <div>
            <FL>Pip noticed these action items — keep the ones you want.</FL>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {extractedItems.map(function (it, idx) {
                var faded = !it.checked;
                return (
                  <div
                    key={idx}
                    style={{
                      background: it.checked ? C.surface : "transparent",
                      border: "1px solid " + (it.checked ? C.accentLine : C.rule),
                      borderLeft: "2px solid " + (it.confidence === "low" ? C.yellow : it.confidence === "high" ? C.accent : C.accentDim),
                      borderRadius: 10,
                      padding: "10px 12px",
                      opacity: faded ? 0.55 : 1,
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={function () { toggleItem(idx); }}
                        style={{ width: 16, height: 16, accentColor: C.accent, flexShrink: 0, marginTop: 4 }}
                      />
                      <textarea
                        value={it.text}
                        onChange={function (e) { editItem(idx, "text", e.target.value); }}
                        rows={2}
                        style={{
                          flex: 1, background: "transparent",
                          border: "none", outline: "none",
                          color: C.text, fontSize: 13.5, fontFamily: INTER,
                          padding: 0, lineHeight: 1.45,
                          resize: "none",
                          boxSizing: "border-box",
                          minWidth: 0,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 26, flexWrap: "wrap" }}>
                      <input
                        type="date"
                        value={it.due_date || ""}
                        onChange={function (e) { editItem(idx, "due_date", e.target.value); }}
                        style={{
                          background: C.bgDark, border: "1px solid " + C.rule,
                          borderRadius: 6, padding: "4px 8px",
                          color: it.due_date ? C.text : C.textMuted,
                          fontSize: 12, fontFamily: INTER, outline: "none",
                          colorScheme: "dark",
                        }}
                      />
                      <select
                        value={it.assignee || ""}
                        onChange={function (e) { editItem(idx, "assignee", e.target.value); }}
                        style={{
                          background: C.bgDark, border: "1px solid " + C.rule,
                          borderRadius: 6, padding: "4px 8px",
                          color: it.assignee ? C.text : C.textMuted,
                          fontSize: 12, fontFamily: INTER, outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">Unassigned</option>
                        {(members || []).map(function (m) {
                          var email = m.email || m.invited_email;
                          if (!email) return null;
                          return <option key={email} value={email}>{email}</option>;
                        })}
                      </select>
                      {it.confidence === "low" && (
                        <span style={{
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontSize: 9, color: C.yellow,
                          textTransform: "uppercase", letterSpacing: "0.07em",
                        }}>
                          Pip's not sure
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
          <SecBtn
            style={{ flex: 1 }}
            onClick={phase === "review" ? function () { setPhase("compose"); } : onClose}
            disabled={loading}
          >
            {phase === "review" ? "Back" : "Cancel"}
          </SecBtn>
          {phase === "review" ? (
            <AmberBtn style={{ flex: 1 }} onClick={handleSaveReviewed} disabled={loading}>
              {(function () {
                if (loading) return "Saving…";
                var n = extractedItems.filter(function (it) { return it.checked; }).length;
                return n > 0 ? "Save with " + n + " item" + (n !== 1 ? "s" : "") : "Save";
              })()}
            </AmberBtn>
          ) : (
            <AmberBtn style={{ flex: 1 }} onClick={handleStart} disabled={!canStart || phase === "extracting"}>
              {phase === "extracting" ? "Pip's reading…"
                : loading ? (isQuickLog ? "Logging…" : "Starting…")
                : (isQuickLog ? "Log it" : "Start Conversation →")}
            </AmberBtn>
          )}
        </div>
      </div>
    </Modal>
  );
}

export { METHOD_LABEL };
