import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { FL } from "../../components/FieldLabel";
import { InputField } from "../../components/InputField";

var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function lastOccurrenceOf(dayOfWeek) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var daysBack = (today.getDay() - dayOfWeek + 7) % 7;
  var d = new Date(today);
  d.setDate(today.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}
var HOURS   = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
var MINUTES = ['00', '15', '30', '45'];

function toHHMM(hour12, minute, ampm) {
  var h = parseInt(hour12);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + minute;
}

function fromHHMM(hhmm) {
  if (!hhmm) return { hour: '9', minute: '00', ampm: 'AM' };
  var parts = hhmm.split(':');
  var h = parseInt(parts[0]);
  var m = String(parseInt(parts[1] || 0)).padStart(2, '0');
  var closestMin = ['00', '15', '30', '45'].reduce(function (best, v) {
    return Math.abs(parseInt(v) - parseInt(m)) < Math.abs(parseInt(best) - parseInt(m)) ? v : best;
  }, '00');
  var ampm = h >= 12 ? 'PM' : 'AM';
  var hour = h % 12 || 12;
  return { hour: String(hour), minute: closestMin, ampm };
}

export function SetCadenceModal({ onSave, onClose, existing, initialValues, accounts, contacts }) {
  var seed = existing || initialValues || {};
  var init = seed.meeting_time ? fromHHMM(seed.meeting_time) : { hour: '9', minute: '00', ampm: 'AM' };

  var [type,          setType]          = useState(seed.type       || 'meeting');
  var [taskTitle,     setTaskTitle]     = useState(seed.task_title || '');
  var [frequency,     setFrequency]     = useState(seed.frequency    || 'weekly');
  var [dayOfWeek,     setDayOfWeek]     = useState(seed.day_of_week  ?? 1);
  var [dayOfMonth,    setDayOfMonth]    = useState(seed.day_of_month ?? 1);
  var [anchorDate,    setAnchorDate]    = useState(seed.anchor_date  || lastOccurrenceOf(seed.day_of_week ?? 1));
  var [monthlyType,   setMonthlyType]   = useState(seed.monthly_type    || 'day_of_month');
  var [monthlyOrdinal, setMonthlyOrdinal] = useState(seed.monthly_ordinal || 'first');
  var [selectedAccountId,  setSelectedAccountId]  = useState(null);
  var [selectedAccountIds, setSelectedAccountIds] = useState([]);
  var [acctDropOpen,       setAcctDropOpen]       = useState(false);
  var [defaultAttendees, setDefaultAttendees]   = useState(existing ? (existing.default_attendees || []) : []);
  var [hour,   setHour]   = useState(init.hour);
  var [minute, setMinute] = useState(init.minute);
  var [ampm,   setAmpm]   = useState(init.ampm);
  var [notes,  setNotes]  = useState(existing ? (existing.notes || '') : '');
  var [loading, setLoading] = useState(false);
  var [error,   setError]   = useState(null);

  function toggleAccountId(id) {
    setSelectedAccountIds(function (prev) {
      return prev.includes(id) ? prev.filter(function (a) { return a !== id; }) : prev.concat([id]);
    });
  }

  useEffect(function () {
    if (frequency === 'biweekly') setAnchorDate(lastOccurrenceOf(dayOfWeek));
  }, [dayOfWeek, frequency]);

  function toggleDefaultAttendee(name) {
    setDefaultAttendees(function (prev) {
      return prev.includes(name) ? prev.filter(function (n) { return n !== name; }) : prev.concat([name]);
    });
  }

  function handleSave() {
    var isMultiTask = accounts && type === 'task';
    if (accounts && type === 'meeting' && !selectedAccountId) { setError("Please select an account."); return; }
    if (isMultiTask && selectedAccountIds.length === 0) { setError("Please select at least one account."); return; }
    if (type === 'task' && !taskTitle.trim()) { setError("Task description is required."); return; }
    setLoading(true);
    setError(null);
    var isOrdinalMonthly = frequency === 'monthly' && monthlyType === 'day_of_week';
    var payload = {
      type,
      task_title:      type === 'task' ? taskTitle.trim() : null,
      frequency,
      day_of_week:     (frequency !== 'monthly' || isOrdinalMonthly) ? dayOfWeek : null,
      day_of_month:    frequency === 'monthly' && !isOrdinalMonthly ? dayOfMonth : null,
      anchor_date:     frequency === 'biweekly' ? anchorDate : null,
      monthly_type:    frequency === 'monthly' ? monthlyType : null,
      monthly_ordinal: isOrdinalMonthly ? monthlyOrdinal : null,
      meeting_time:    type === 'meeting' ? toHHMM(hour, minute, ampm) : null,
      notes:           notes.trim() || null,
      default_attendees: type === 'meeting' && defaultAttendees.length > 0 ? defaultAttendees : null,
    };
    if (accounts && type === 'meeting') payload.account_id = selectedAccountId;
    if (isMultiTask) payload.account_ids = selectedAccountIds;
    else if (accounts && selectedAccountId) payload.account_id = selectedAccountId;
    onSave(payload)
      .then(function () { setLoading(false); onClose(); })
      .catch(function (err) { setLoading(false); setError(err.message); });
  }

  var pill = {
    active:   { border: '1px solid rgba(74,155,130,0.4)', background: 'rgba(74,155,130,0.12)', color: C.accent,    fontWeight: 700 },
    inactive: { border: '1px solid ' + C.border,          background: 'rgba(255,255,255,0.03)', color: C.textMuted, fontWeight: 400 },
  };

  function pillStyle(active) {
    return Object.assign({ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }, active ? pill.active : pill.inactive);
  }
  function dayStyle(active) {
    return Object.assign({ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }, active ? pill.active : pill.inactive);
  }

  return (
    <Modal title={existing ? "Edit " + (type === 'task' ? 'Task' : 'Meeting') + " Cadence" : "Add Cadence"} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Type toggle */}
        {!existing && (
          <div>
            <FL>Type</FL>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['meeting', '📅 Meeting'], ['task', '✓ Recurring Task']].map(function (pair) {
                return (
                  <button key={pair[0]} type="button" onClick={function () { setType(pair[0]); }}
                    style={pillStyle(type === pair[0])}>
                    {pair[1]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Task description (task type only) */}
        {type === 'task' && (
          <div>
            <FL>What needs to get done?</FL>
            <InputField
              value={taskTitle}
              onChange={function (e) { setTaskTitle(e.target.value); }}
              placeholder="e.g. Send QBR report to this account"
              autoFocus={type === 'task'}
            />
          </div>
        )}

        {/* Account picker (global cadence view) */}
        {accounts && accounts.length > 0 && type === 'meeting' && (
          <div>
            <FL>Account</FL>
            <select
              value={selectedAccountId || ''}
              onChange={function (e) { setSelectedAccountId(e.target.value || null); }}
              style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: selectedAccountId ? C.text : C.textMuted, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}
            >
              <option value="">Select an account...</option>
              {accounts.map(function (a) { return <option key={a.id} value={a.id}>{a.name}</option>; })}
            </select>
          </div>
        )}

        {/* Multi-account picker for tasks */}
        {accounts && accounts.length > 0 && type === 'task' && (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <FL style={{ marginBottom: 0 }}>Accounts</FL>
              {selectedAccountIds.length > 0 && (
                <button type="button" onClick={function () { setSelectedAccountIds([]); }}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: C.textMuted, cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                  Clear all
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={function () { setAcctDropOpen(function (o) { return !o; }); }}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (acctDropOpen ? 'rgba(74,155,130,0.4)' : C.border),
                borderRadius: 8, padding: '9px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: selectedAccountIds.length > 0 ? C.text : C.textMuted,
              }}
            >
              <span>
                {selectedAccountIds.length === 0 && 'Select accounts...'}
                {selectedAccountIds.length === 1 && accounts.find(function (a) { return a.id === selectedAccountIds[0]; })?.name}
                {selectedAccountIds.length > 1 && selectedAccountIds.length + ' accounts selected'}
              </span>
              <span style={{ fontSize: 10, color: C.textMuted }}>{acctDropOpen ? '▲' : '▼'}</span>
            </button>

            {acctDropOpen && (
              <>
                <div onClick={function () { setAcctDropOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#1a2b28', border: '1px solid ' + C.border,
                  borderRadius: 10, padding: 10, zIndex: 11,
                  maxHeight: 240, overflowY: 'auto',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button type="button"
                      onClick={function () {
                        setSelectedAccountIds(
                          selectedAccountIds.length === accounts.length ? [] : accounts.map(function (a) { return a.id; })
                        );
                      }}
                      style={{
                        background: selectedAccountIds.length === accounts.length ? 'rgba(74,155,130,0.15)' : 'rgba(74,155,130,0.06)',
                        color: C.accent,
                        border: '1px solid rgba(74,155,130,' + (selectedAccountIds.length === accounts.length ? '0.4' : '0.2') + ')',
                        borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                      }}>
                      {selectedAccountIds.length === accounts.length ? '✓ All accounts' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {accounts.map(function (a) {
                      var on = selectedAccountIds.includes(a.id);
                      return (
                        <button key={a.id} type="button" onClick={function () { toggleAccountId(a.id); }}
                          style={{
                            background: on ? 'rgba(74,155,130,0.18)' : 'rgba(255,255,255,0.04)',
                            color: on ? C.accent : C.textMuted,
                            border: '1px solid ' + (on ? 'rgba(74,155,130,0.45)' : C.border),
                            borderRadius: 6, padding: '5px 11px', fontSize: 12,
                            fontWeight: on ? 700 : 400,
                            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                          }}>
                          {on ? '✓ ' : ''}{a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Frequency */}
        <div>
          <FL>Frequency</FL>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['weekly', 'Weekly'], ['biweekly', 'Bi-weekly'], ['monthly', 'Monthly']].map(function (pair) {
              return (
                <button key={pair[0]} type="button" onClick={function () { setFrequency(pair[0]); }}
                  style={pillStyle(frequency === pair[0])}>
                  {pair[1]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day of week */}
        {frequency !== 'monthly' && (
          <div>
            <FL>Day</FL>
            <div style={{ display: 'flex', gap: 4 }}>
              {DAYS_SHORT.map(function (d, i) {
                return (
                  <button key={d} type="button" onClick={function () { setDayOfWeek(i); }}
                    style={dayStyle(dayOfWeek === i)}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Anchor date (biweekly only) */}
        {frequency === 'biweekly' && (
          <div>
            <FL>Last {type === 'task' ? 'Date' : 'Meeting'} Date</FL>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>Locks in the correct bi-weekly cycle</div>
            <input
              type="date" value={anchorDate}
              onChange={function (e) { setAnchorDate(e.target.value); }}
              style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}
            />
          </div>
        )}

        {/* Monthly fields */}
        {frequency === 'monthly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <FL>Monthly Pattern</FL>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['day_of_month', 'By Date'], ['day_of_week', 'By Day']].map(function (pair) {
                  return (
                    <button key={pair[0]} type="button" onClick={function () { setMonthlyType(pair[0]); }}
                      style={pillStyle(monthlyType === pair[0])}>
                      {pair[1]}
                    </button>
                  );
                })}
              </div>
            </div>
            {monthlyType === 'day_of_month' && (
              <div>
                <FL>Day of Month</FL>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number" min="1" max="31" value={dayOfMonth}
                    onChange={function (e) { var v = parseInt(e.target.value); if (v >= 1 && v <= 31) setDayOfMonth(v); }}
                    style={{ width: 72, padding: '9px 12px', textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <span style={{ fontSize: 12, color: C.textMuted }}>of each month</span>
                </div>
              </div>
            )}
            {monthlyType === 'day_of_week' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <FL>Ordinal</FL>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['first','1st'],['second','2nd'],['third','3rd'],['fourth','4th'],['last','Last']].map(function (pair) {
                      return (
                        <button key={pair[0]} type="button" onClick={function () { setMonthlyOrdinal(pair[0]); }}
                          style={Object.assign({}, pillStyle(monthlyOrdinal === pair[0]), { flex: 1, fontSize: 11 })}>
                          {pair[1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <FL>Day</FL>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DAYS_SHORT.map(function (d, i) {
                      return (
                        <button key={d} type="button" onClick={function () { setDayOfWeek(i); }}
                          style={dayStyle(dayOfWeek === i)}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Time (meeting only) */}
        {type === 'meeting' && (
          <div>
            <FL>Time</FL>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={hour} onChange={function (e) { setHour(e.target.value); }}
                style={{ flex: 1, padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>
                {HOURS.map(function (h) { return <option key={h} value={h}>{h}</option>; })}
              </select>
              <span style={{ color: C.textMuted, fontSize: 16, fontWeight: 700 }}>:</span>
              <select value={minute} onChange={function (e) { setMinute(e.target.value); }}
                style={{ flex: 1, padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>
                {MINUTES.map(function (m) { return <option key={m} value={m}>{m}</option>; })}
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                {['AM', 'PM'].map(function (p) {
                  return (
                    <button key={p} type="button" onClick={function () { setAmpm(p); }}
                      style={Object.assign({}, pillStyle(ampm === p), { flex: 'none', padding: '9px 14px' })}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Default attendees (meeting only) */}
        {type === 'meeting' && contacts && contacts.length > 0 && (
          <div>
            <FL>Default Attendees <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {contacts.map(function (c) {
                var active = defaultAttendees.includes(c.name);
                return (
                  <button key={c.id} type="button" onClick={function () { toggleDefaultAttendee(c.name); }}
                    style={{ background: active ? 'rgba(74,155,130,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (active ? 'rgba(74,155,130,0.4)' : C.border), borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.accent : C.textMuted, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                    {active ? '✓ ' : ''}{c.name}{c.title ? ' · ' + c.title : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <FL>{type === 'task' ? 'Notes' : 'Standing Agenda'} <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <textarea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder={type === 'task' ? 'Any extra context...' : 'Recurring topics, prep reminders...'}
            rows={2}
            style={{ width: '100%', padding: '9px 12px', resize: 'vertical', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : (existing ? 'Save Changes' : (type === 'task' ? 'Add Task' : 'Set Cadence'))}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>
      </div>
    </Modal>
  );
}
