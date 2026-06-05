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

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatDateLong(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function autoTitle(method, dateISO) {
  var methodLabels = { phone: "Phone", in_person: "In Person", video: "Video", email: "Email" };
  var label = methodLabels[method] || "Meeting";
  return label + " — " + formatDateLong(dateISO);
}

/**
 * Modal for scheduling a one-off future meeting on the calendar.
 *
 * Props:
 *  - accounts       Array of all accounts (required, inactive accounts filtered)
 *  - defaultDate    ISO date string to prefill (e.g. from clicking a calendar day)
 *  - onSchedule({ account_id, meeting_date, meeting_time, method, agenda, title,
 *                 status:'scheduled', cadence_id:null, user_id: ... })
 *  - onClose
 */
export function ScheduleMeetingModal({ accounts, defaultDate, onSchedule, onClose }) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;

  var activeAccounts = useMemo(function () {
    return (accounts || [])
      .filter(function (a) { return !a.is_inactive; })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }, [accounts]);

  var [search, setSearch]       = useState("");
  var [selectedAccountId, setSelectedAccountId] = useState("");
  var [method, setMethod]       = useState("");
  var [date, setDate]           = useState(defaultDate || todayISO());
  var [time, setTime]           = useState("");
  var [agenda, setAgenda]       = useState("");
  var [loading, setLoading]     = useState(false);
  var [error, setError]         = useState(null);

  var selectedAccount = useMemo(function () {
    if (!selectedAccountId) return null;
    return activeAccounts.find(function (a) { return a.id === selectedAccountId; }) || null;
  }, [selectedAccountId, activeAccounts]);

  // Auto-select when the search narrows to exactly one match.
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

  var canSchedule = Boolean(selectedAccountId && method && date && !loading);

  function handleSchedule() {
    if (!canSchedule) return;
    setError(null);
    setLoading(true);
    var payload = {
      account_id:   selectedAccountId,
      meeting_date: date,
      meeting_time: time.trim() || null,
      method:       method,
      agenda:       agenda.trim() || null,
      title:        autoTitle(method, date),
      status:       "scheduled",
      cadence_id:   null,
    };
    Promise.resolve(onSchedule(payload)).then(function () {
      setLoading(false);
    }).catch(function (err) {
      setLoading(false);
      setError((err && err.message) || "Couldn't schedule the meeting. Try again.");
    });
  }

  return (
    <Modal title="Schedule Meeting" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Account picker */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <FL htmlFor="sched-acct">Account</FL>
            {selectedAccount ? (
              <span style={{ fontSize: 10.5, color: C.accent, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ✓ {selectedAccount.name}
              </span>
            ) : (
              <span style={{ fontSize: 10.5, color: C.textMuted, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                required
              </span>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input
              id="sched-acct"
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

        {/* Method */}
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

        {/* Date + Time row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FL htmlFor="sched-date">Date</FL>
            <InputField
              id="sched-date"
              type="date"
              value={date}
              onChange={function (e) { setDate(e.target.value); }}
            />
          </div>
          <div>
            <FL htmlFor="sched-time">
              Time <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
            </FL>
            <InputField
              id="sched-time"
              type="time"
              value={time}
              onChange={function (e) { setTime(e.target.value); }}
            />
          </div>
        </div>

        {/* Agenda */}
        <div>
          <FL htmlFor="sched-agenda">
            Agenda <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span>
          </FL>
          <TextArea
            id="sched-agenda"
            value={agenda}
            onChange={function (e) { setAgenda(e.target.value); }}
            placeholder="Topics, prep notes, or reminders for this meeting…"
            rows={3}
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

        {!canSchedule && !loading && (
          <div style={{
            fontFamily: INTER, fontSize: 11.5, color: C.textMuted,
            marginTop: -4, marginBottom: -4, textAlign: "right",
          }}>
            {!selectedAccountId ? "Pick an account to continue."
              : !method ? "Pick a method to continue."
              : !date ? "Pick a date to continue."
              : ""}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <SecBtn style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancel
          </SecBtn>
          <AmberBtn style={{ flex: 1 }} onClick={handleSchedule} disabled={!canSchedule}>
            {loading ? "Scheduling…" : "Schedule →"}
          </AmberBtn>
        </div>
      </div>
    </Modal>
  );
}
