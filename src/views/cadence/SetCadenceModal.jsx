import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { FL } from "../../components/FieldLabel";
import { InputField } from "../../components/InputField";
import { ChipDropdown } from "../../components/ChipDropdown";

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

export function SetCadenceModal({ onSave, onClose, existing, initialValues, accounts, contacts, initialScope }) {
  var seed = existing || initialValues || {};
  var init = seed.meeting_time ? fromHHMM(seed.meeting_time) : { hour: '9', minute: '00', ampm: 'AM' };

  var [scope,          setScope]         = useState(seed.cadence_scope || initialScope || 'account');
  var [selectedContactId, setSelectedContactId] = useState(seed.contact_id || null);
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
  var [defaultAttendees, setDefaultAttendees]   = useState(existing ? (existing.default_attendees || []) : []);
  var [hour,   setHour]   = useState(init.hour);
  var [minute, setMinute] = useState(init.minute);
  var [ampm,   setAmpm]   = useState(init.ampm);
  var [notes,  setNotes]  = useState(existing ? (existing.notes || '') : '');
  var [loading, setLoading] = useState(false);
  var [error,   setError]   = useState(null);

  // Person 1:1 mode always uses meeting type
  var effectiveType = scope === 'person' ? 'meeting' : type;

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
    // Person 1:1 scope validation
    if (scope === 'person') {
      if (!selectedContactId) { setError("Please select a person."); return; }
      setLoading(true);
      setError(null);
      var isOrdinalMonthlyP = frequency === 'monthly' && monthlyType === 'day_of_week';
      var personPayload = {
        type:            'meeting',
        cadence_scope:   'person',
        contact_id:      selectedContactId,
        account_id:      null,
        task_title:      null,
        frequency,
        day_of_week:     (frequency !== 'monthly' || isOrdinalMonthlyP) ? dayOfWeek : null,
        day_of_month:    frequency === 'monthly' && !isOrdinalMonthlyP ? dayOfMonth : null,
        anchor_date:     frequency === 'biweekly' ? anchorDate : null,
        monthly_type:    frequency === 'monthly' ? monthlyType : null,
        monthly_ordinal: isOrdinalMonthlyP ? monthlyOrdinal : null,
        meeting_time:    toHHMM(hour, minute, ampm),
        notes:           notes.trim() || null,
        default_attendees: null,
      };
      onSave(personPayload)
        .then(function () { setLoading(false); onClose(); })
        .catch(function (err) { setLoading(false); setError(err.message); });
      return;
    }

    var isMultiTask = accounts && effectiveType === 'task';
    if (accounts && effectiveType === 'meeting' && !selectedAccountId) { setError("Please select an account."); return; }
    if (isMultiTask && selectedAccountIds.length === 0) { setError("Please select at least one account."); return; }
    if (effectiveType === 'task' && !taskTitle.trim()) { setError("Task description is required."); return; }
    setLoading(true);
    setError(null);
    var isOrdinalMonthly = frequency === 'monthly' && monthlyType === 'day_of_week';
    var payload = {
      type:            effectiveType,
      cadence_scope:   'account',
      task_title:      effectiveType === 'task' ? taskTitle.trim() : null,
      frequency,
      day_of_week:     (frequency !== 'monthly' || isOrdinalMonthly) ? dayOfWeek : null,
      day_of_month:    frequency === 'monthly' && !isOrdinalMonthly ? dayOfMonth : null,
      anchor_date:     frequency === 'biweekly' ? anchorDate : null,
      monthly_type:    frequency === 'monthly' ? monthlyType : null,
      monthly_ordinal: isOrdinalMonthly ? monthlyOrdinal : null,
      meeting_time:    effectiveType === 'meeting' ? toHHMM(hour, minute, ampm) : null,
      notes:           notes.trim() || null,
      default_attendees: effectiveType === 'meeting' && defaultAttendees.length > 0 ? defaultAttendees : null,
    };
    if (accounts && effectiveType === 'meeting') payload.account_id = selectedAccountId;
    if (isMultiTask) payload.account_ids = selectedAccountIds;
    else if (accounts && selectedAccountId) payload.account_id = selectedAccountId;
    onSave(payload)
      .then(function () { setLoading(false); onClose(); })
      .catch(function (err) { setLoading(false); setError(err.message); });
  }

  var pill = {
    active:   { border: '1px solid ' + C.accentBorder, background: C.accentGlow, color: C.accent,    fontWeight: 700 },
    inactive: { border: '1px solid ' + C.border,          background: 'rgba(255,255,255,0.03)', color: C.textMuted, fontWeight: 400 },
  };

  function pillStyle(active) {
    return Object.assign({ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }, active ? pill.active : pill.inactive);
  }
  function dayStyle(active) {
    return Object.assign({ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }, active ? pill.active : pill.inactive);
  }

  var modalTitle = existing
    ? "Edit " + (effectiveType === 'task' ? 'Task' : scope === 'person' ? '1:1' : 'Meeting') + " Cadence"
    : scope === 'person' ? "Add 1:1 Cadence" : "Add Cadence";

  return (
    <Modal title={modalTitle} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Scope toggle — only for new cadences */}
        {!existing && (
          <div>
            <FL>Cadence Type</FL>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['account', '📋 Account'], ['person', '🤝 Person 1:1']].map(function (pair) {
                return (
                  <button key={pair[0]} type="button" onClick={function () { setScope(pair[0]); }}
                    style={pillStyle(scope === pair[0])}>
                    {pair[1]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Person picker — shown when scope is 'person' */}
        {scope === 'person' && contacts && contacts.length > 0 && (
          <div>
            <FL>Person</FL>
            <ChipDropdown
              options={contacts.map(function (c) { return c.name + (c.title ? ' · ' + c.title : ''); })}
              value={selectedContactId ? (function () {
                var c = contacts.find(function (c) { return c.id === selectedContactId; });
                return c ? c.name + (c.title ? ' · ' + c.title : '') : '';
              })() : ''}
              onSelect={function (nameWithTitle) {
                var c = contacts.find(function (c) { return (c.name + (c.title ? ' · ' + c.title : '')) === nameWithTitle; });
                if (c) setSelectedContactId(c.id);
              }}
              placeholder="Select a person..."
            />
          </div>
        )}
        {scope === 'person' && (!contacts || contacts.length === 0) && (
          <div style={{ fontSize: 12, color: C.textMuted, padding: '6px 0' }}>
            No contacts found. Add contacts to your accounts first, then set a 1:1 cadence with them here.
          </div>
        )}

        {/* Type toggle — account scope only */}
        {!existing && scope === 'account' && (
          <div>
            <FL>Type</FL>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['meeting', '📅 Meeting'], ['task', '✓ Recurring Task']].map(function (pair) {
                return (
                  <button key={pair[0]} type="button" onClick={function () { setType(pair[0]); }}
                    style={pillStyle(effectiveType === pair[0])}>
                    {pair[1]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Task description (task type only) */}
        {effectiveType === 'task' && scope === 'account' && (
          <div>
            <FL>What needs to get done?</FL>
            <InputField
              value={taskTitle}
              onChange={function (e) { setTaskTitle(e.target.value); }}
              placeholder="e.g. Send QBR report to this account"
              autoFocus={effectiveType === 'task'}
            />
          </div>
        )}

        {/* Account picker (global cadence view — meetings) */}
        {scope === 'account' && accounts && accounts.length > 0 && effectiveType === 'meeting' && (
          <div>
            <FL>Account</FL>
            <ChipDropdown
              options={accounts.map(function (a) { return a.name; })}
              value={selectedAccountId ? (accounts.find(function (a) { return a.id === selectedAccountId; }) || {}).name || '' : ''}
              onSelect={function (name) {
                var acct = accounts.find(function (a) { return a.name === name; });
                if (acct) setSelectedAccountId(acct.id);
              }}
              placeholder="Select an account..."
            />
          </div>
        )}

        {/* Multi-account picker for tasks */}
        {scope === 'account' && accounts && accounts.length > 0 && effectiveType === 'task' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <FL style={{ marginBottom: 0 }}>Accounts</FL>
              {selectedAccountIds.length > 0 && (
                <button type="button" onClick={function () { setSelectedAccountIds([]); }}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: C.textMuted, cursor: 'pointer', padding: 0, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  Clear all
                </button>
              )}
            </div>
            <ChipDropdown
              multi
              options={accounts.map(function (a) { return a.name; })}
              values={selectedAccountIds.map(function (id) {
                var acct = accounts.find(function (a) { return a.id === id; });
                return acct ? acct.name : id;
              })}
              onSelect={function (name) {
                var acct = accounts.find(function (a) { return a.name === name; });
                if (acct) toggleAccountId(acct.id);
              }}
              placeholder="Select accounts..."
            />
            {selectedAccountIds.length > 0 && accounts && selectedAccountIds.length === accounts.length && (
              <div style={{ fontSize: 11, color: C.accent, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>↻</span>
                <span>All accounts selected — saves as a global task and auto-applies to new accounts.</span>
              </div>
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
            <FL>Last {effectiveType === 'task' ? 'Date' : 'Meeting'} Date</FL>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>Locks in the correct bi-weekly cycle</div>
            <input
              type="date" value={anchorDate}
              onChange={function (e) { setAnchorDate(e.target.value); }}
              style={{ width: '100%', padding: '9px 12px', background: 'var(--c-input-fill)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'Inter', system-ui, sans-serif" }}
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
                    style={{ width: 72, padding: '9px 12px', textAlign: 'center', background: 'var(--c-input-fill)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 16, fontFamily: "'Inter', system-ui, sans-serif" }}
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
        {effectiveType === 'meeting' && (
          <div>
            <FL>Hour</FL>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 10 }}>
              {HOURS.map(function (h) {
                return (
                  <button key={h} type="button" onClick={function () { setHour(h); }}
                    style={pillStyle(hour === h)}>
                    {h}
                  </button>
                );
              })}
            </div>
            <FL>Minute</FL>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {MINUTES.map(function (m) {
                return (
                  <button key={m} type="button" onClick={function () { setMinute(m); }}
                    style={Object.assign({}, pillStyle(minute === m), { flex: 1 })}>
                    :{m}
                  </button>
                );
              })}
            </div>
            <FL>AM / PM</FL>
            <div style={{ display: 'flex', gap: 6 }}>
              {['AM', 'PM'].map(function (p) {
                return (
                  <button key={p} type="button" onClick={function () { setAmpm(p); }}
                    style={Object.assign({}, pillStyle(ampm === p), { flex: 1 })}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Default attendees (account meeting only — not person 1:1s) */}
        {scope === 'account' && effectiveType === 'meeting' && contacts && contacts.length > 0 && (
          <div>
            <FL>Default Attendees <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {contacts.map(function (c) {
                var active = defaultAttendees.includes(c.name);
                return (
                  <button key={c.id} type="button" onClick={function () { toggleDefaultAttendee(c.name); }}
                    style={{ background: active ? C.accentMid : 'var(--c-input-fill)', border: '1px solid ' + (active ? C.accentBorder : C.border), borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.accent : C.textMuted, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }}>
                    {active ? '✓ ' : ''}{c.name}{c.title ? ' · ' + c.title : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <FL>{effectiveType === 'task' ? 'Notes' : scope === 'person' ? 'Talking Points' : 'Standing Agenda'} <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <textarea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder={effectiveType === 'task' ? 'Any extra context...' : scope === 'person' ? 'Regular topics, things to remember...' : 'Recurring topics, prep reminders...'}
            rows={2}
            style={{ width: '100%', padding: '9px 12px', resize: 'vertical', background: 'var(--c-input-fill)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif" }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.red }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : (existing ? 'Save Changes' : (scope === 'person' ? 'Set 1:1' : effectiveType === 'task' ? 'Add Task' : 'Set Cadence'))}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>
      </div>
    </Modal>
  );
}
