import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { FL } from "../../components/FieldLabel";

var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function lastOccurrenceOf(dayOfWeek) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var daysBack = (today.getDay() - dayOfWeek + 7) % 7;
  var d = new Date(today);
  d.setDate(today.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}
var HOURS      = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
var MINUTES    = ['00', '15', '30', '45'];

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

export function SetCadenceModal({ onSave, onClose, existing, initialValues }) {
  var seed = existing || initialValues || {};
  var init = seed.meeting_time ? fromHHMM(seed.meeting_time) : { hour: '9', minute: '00', ampm: 'AM' };

  var [frequency,   setFrequency]   = useState(seed.frequency    || 'weekly');
  var [dayOfWeek,   setDayOfWeek]   = useState(seed.day_of_week  ?? 1);
  var [dayOfMonth,  setDayOfMonth]  = useState(seed.day_of_month ?? 1);
  var [anchorDate,  setAnchorDate]  = useState(seed.anchor_date  || lastOccurrenceOf(seed.day_of_week ?? 1));

  useEffect(function () {
    if (frequency === 'biweekly') setAnchorDate(lastOccurrenceOf(dayOfWeek));
  }, [dayOfWeek, frequency]);
  var [hour,        setHour]        = useState(init.hour);
  var [minute,      setMinute]      = useState(init.minute);
  var [ampm,        setAmpm]        = useState(init.ampm);
  var [notes,       setNotes]       = useState(existing ? (existing.notes || '') : '');
  var [loading,     setLoading]     = useState(false);
  var [error,       setError]       = useState(null);

  function handleSave() {
    setLoading(true);
    setError(null);
    onSave({
      frequency,
      day_of_week:  frequency !== 'monthly' ? dayOfWeek  : null,
      day_of_month: frequency === 'monthly'  ? dayOfMonth : null,
      anchor_date:  frequency === 'biweekly' ? anchorDate : null,
      meeting_time: toHHMM(hour, minute, ampm),
      notes:        notes.trim() || null,
    })
      .then(function () { setLoading(false); onClose(); })
      .catch(function (err) { setLoading(false); setError(err.message); });
  }

  var pill = {
    active: {
      border: '1px solid rgba(200,136,58,0.4)',
      background: 'rgba(200,136,58,0.12)',
      color: C.accent,
      fontWeight: 700,
    },
    inactive: {
      border: '1px solid ' + C.border,
      background: 'rgba(255,255,255,0.03)',
      color: C.textMuted,
      fontWeight: 400,
    },
  };

  function pillStyle(active) {
    return Object.assign({
      flex: 1, padding: '8px 0', borderRadius: 8,
      fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
    }, active ? pill.active : pill.inactive);
  }

  function dayStyle(active) {
    return Object.assign({
      flex: 1, padding: '7px 0', borderRadius: 7,
      fontSize: 11, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
    }, active ? pill.active : pill.inactive);
  }

  return (
    <Modal title={existing ? "Edit Cadence" : "Set Cadence"} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
            <FL>Last Meeting Date</FL>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
              Locks in the correct bi-weekly cycle
            </div>
            <input
              type="date"
              value={anchorDate}
              onChange={function (e) { setAnchorDate(e.target.value); }}
              style={{
                width: '100%', padding: '9px 12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
                borderRadius: 8, color: C.text, fontSize: 16,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        )}

        {/* Day of month */}
        {frequency === 'monthly' && (
          <div>
            <FL>Day of Month</FL>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" min="1" max="31" value={dayOfMonth}
                onChange={function (e) {
                  var v = parseInt(e.target.value);
                  if (v >= 1 && v <= 31) setDayOfMonth(v);
                }}
                style={{
                  width: 72, padding: '9px 12px', textAlign: 'center',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
                  borderRadius: 8, color: C.text, fontSize: 16,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <span style={{ fontSize: 12, color: C.textMuted }}>of each month</span>
            </div>
          </div>
        )}

        {/* Time */}
        <div>
          <FL>Time</FL>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={hour} onChange={function (e) { setHour(e.target.value); }}
              style={{
                flex: 1, padding: '9px 10px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
                borderRadius: 8, color: C.text, fontSize: 16,
                fontFamily: "'DM Sans', sans-serif",
              }}>
              {HOURS.map(function (h) { return <option key={h} value={h}>{h}</option>; })}
            </select>
            <span style={{ color: C.textMuted, fontSize: 16, fontWeight: 700 }}>:</span>
            <select value={minute} onChange={function (e) { setMinute(e.target.value); }}
              style={{
                flex: 1, padding: '9px 10px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
                borderRadius: 8, color: C.text, fontSize: 16,
                fontFamily: "'DM Sans', sans-serif",
              }}>
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

        {/* Standing agenda */}
        <div>
          <FL>Standing Agenda <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <textarea
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Recurring topics, prep reminders..."
            rows={2}
            style={{
              width: '100%', padding: '9px 12px', resize: 'vertical',
              background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border,
              borderRadius: 8, color: C.text, fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.red,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : (existing ? 'Save Changes' : 'Set Cadence')}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>
      </div>
    </Modal>
  );
}
