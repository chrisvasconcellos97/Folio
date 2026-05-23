import { useState, useEffect } from "react";
import { C } from "../../../lib/colors";
import { AmberBtn, SecBtn, DangerBtn } from "../../../components/Buttons";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { SetCadenceModal } from "../../cadence/SetCadenceModal";
import { getNextOccurrence, getFrequencyLabel, formatTime, daysUntil, formatDateFull } from "../../../lib/cadenceUtils";
import { pickV } from "../../../lib/metricsUtils";

function buildCadenceInsight(cadences, account) {
  var seed  = (account.id || account.name) + new Date().getDate().toString();
  var today = new Date(); today.setHours(0, 0, 0, 0);

  var meetingCads = cadences.filter(function (c) { return c.type !== 'task'; });
  var taskCads    = cadences.filter(function (c) { return c.type === 'task'; });

  if (cadences.length === 0) {
    return pickV(seed + "ca0", [
      "No schedules set up yet. A cadence keeps you from going dark on this account.",
      "Nothing scheduled here. Add a meeting cadence or a recurring task to stay on top of this one.",
    ]);
  }

  var upcoming = cadences
    .map(function (c) {
      var next = getNextOccurrence(c, today);
      return next ? { cadence: c, daysOut: Math.round((next - today) / 86400000) } : null;
    })
    .filter(Boolean)
    .sort(function (a, b) { return a.daysOut - b.daysOut; });

  var soonest = upcoming.length > 0 ? upcoming[0] : null;
  var parts   = [];

  // Lead — next occurrence urgency
  if (soonest && soonest.daysOut <= 2) {
    var lbl = soonest.cadence.type === 'task'
      ? (soonest.cadence.task_title || "Recurring task")
      : "Meeting";
    parts.push(pickV(seed + "cal", [
      lbl + " is " + (soonest.daysOut === 0 ? "today" : soonest.daysOut === 1 ? "tomorrow" : "in " + soonest.daysOut + " days") + ". Be ready.",
      (soonest.daysOut === 0 ? "Today: " : soonest.daysOut === 1 ? "Tomorrow: " : "In " + soonest.daysOut + " days: ") + lbl + ".",
    ]));
  } else if (soonest && soonest.daysOut <= 7) {
    var lbl2 = soonest.cadence.type === 'task'
      ? (soonest.cadence.task_title || "Recurring task")
      : "Meeting";
    parts.push(pickV(seed + "cal", [
      "Next up: " + lbl2 + " in " + soonest.daysOut + " day" + (soonest.daysOut !== 1 ? "s" : "") + ". Steady cadence.",
      lbl2 + " coming in " + soonest.daysOut + " day" + (soonest.daysOut !== 1 ? "s" : "") + ".",
    ]));
  } else if (soonest) {
    parts.push(pickV(seed + "cal", [
      cadences.length + " schedule" + (cadences.length !== 1 ? "s" : "") + " active. Next up in " + soonest.daysOut + " days.",
      "Cadence is set — " + soonest.daysOut + " days to the next one.",
    ]));
  } else {
    parts.push(pickV(seed + "cal", [
      cadences.length + " schedule" + (cadences.length !== 1 ? "s" : "") + " configured.",
      "Got " + cadences.length + " cadence" + (cadences.length !== 1 ? "s" : "") + " running for this account.",
    ]));
  }

  // Secondary — mix of types
  if (meetingCads.length > 0 && taskCads.length > 0) {
    parts.push(pickV(seed + "cas", [
      meetingCads.length + " meeting cadence" + (meetingCads.length !== 1 ? "s" : "") + " and " + taskCads.length + " recurring task" + (taskCads.length !== 1 ? "s" : "") + ".",
      "Mix of meetings and tasks scheduled — solid setup.",
    ]));
  } else if (taskCads.length > 0 && meetingCads.length === 0) {
    parts.push(pickV(seed + "cas", [
      "Only recurring tasks here — no meeting cadence set yet.",
      taskCads.length + " recurring task" + (taskCads.length !== 1 ? "s" : "") + " tracked. Consider adding a meeting cadence too.",
    ]));
  }

  return parts.join(" ");
}

function CadenceCard({ cad, today, confirmDeleteId, setConfirmDeleteId, onDeleteCadence, setEditingCad, setShowModal }) {
  var isTask  = cad.type === 'task';
  var next    = getNextOccurrence(cad, today);
  var confirm = confirmDeleteId === cad.id;

  return (
    <div style={{
      background: C.bgCard,
      border: '1px solid ' + C.border,
      borderLeft: '3px solid ' + (isTask ? C.yellow : C.accent),
      borderRadius: 10,
      padding: '13px 15px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: isTask ? C.yellow : C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
            {isTask ? '✓ Recurring Task' : 'Meeting Cadence'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {isTask ? cad.task_title : getFrequencyLabel(cad)}
          </div>
          {isTask && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              {getFrequencyLabel(cad)}
            </div>
          )}
          {next && (
            <div style={{ fontSize: 12, color: isTask ? C.yellow : C.accent, marginTop: 6 }}>
              {isTask ? 'Next due: ' : 'Next: '}{daysUntil(next)} · {formatDateFull(next)}
              {!isTask && cad.meeting_time ? ' · ' + formatTime(cad.meeting_time) : ''}
            </div>
          )}
          {cad.notes && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
              {cad.notes}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <SecBtn onClick={function () { setEditingCad(cad); setShowModal(true); }} style={{ fontSize: 11, padding: '5px 10px' }}>
            Edit
          </SecBtn>
          {!confirm ? (
            <DangerBtn onClick={function () { setConfirmDeleteId(cad.id); }} style={{ fontSize: 11, padding: '5px 10px' }}>
              Remove
            </DangerBtn>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
              <DangerBtn onClick={function () { onDeleteCadence(cad.id); setConfirmDeleteId(null); }} style={{ fontSize: 11, padding: '5px 10px' }}>Yes</DangerBtn>
              <SecBtn onClick={function () { setConfirmDeleteId(null); }} style={{ fontSize: 11, padding: '5px 10px' }}>No</SecBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CadenceTab({ account, cadences, items, meetings, contacts, onAddCadence, onUpdateCadence, onDeleteCadence, onAddItem, onCloseItem, onLogMeeting, onDeleteMeeting, prefill, onPrefillHandled }) {
  var [showModal,       setShowModal]       = useState(false);
  var [editingCad,      setEditingCad]      = useState(null);
  var [prefillValues,   setPrefillValues]   = useState(null);
  var [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(function () {
    if (!prefill) return;
    setPrefillValues(prefill);
    setShowModal(true);
    if (onPrefillHandled) onPrefillHandled();
  }, [prefill]);

  var openItems       = items.filter(function (i) { return !i.done; });
  var today           = new Date(); today.setHours(0, 0, 0, 0);
  var meetingCadences = cadences.filter(function (c) { return c.type !== 'task'; });
  var taskCadences    = cadences.filter(function (c) { return c.type === 'task'; });

  function handleSave(data) {
    if (editingCad) return onUpdateCadence(editingCad.id, data);
    return onAddCadence(Object.assign({}, data, { account_id: account.id }));
  }

  var sectionLabel = {
    fontSize: 10, color: C.textMuted, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
  };

  var cardProps = { today, confirmDeleteId, setConfirmDeleteId, onDeleteCadence, setEditingCad, setShowModal };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <PipInsightCard text={buildCadenceInsight(cadences, account)} />

      {/* Cadences */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={sectionLabel}>
            Schedules{cadences.length > 0 ? ' (' + cadences.length + ')' : ''}
          </div>
          <button
            onClick={function () { setEditingCad(null); setPrefillValues(null); setShowModal(true); }}
            style={{ background: 'none', border: 'none', fontSize: 11, color: C.accent, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            + Add
          </button>
        </div>

        {cadences.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0 20px' }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.35 }}>↻</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>No schedules yet</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 18 }}>
              Add a meeting cadence or a recurring task for this account.
            </div>
            <AmberBtn onClick={function () { setEditingCad(null); setPrefillValues(null); setShowModal(true); }}>Add Cadence</AmberBtn>
          </div>
        )}

        {meetingCadences.map(function (c) {
          return <CadenceCard key={c.id} cad={c} {...cardProps} />;
        })}
        {taskCadences.map(function (c) {
          return <CadenceCard key={c.id} cad={c} {...cardProps} />;
        })}
      </div>

      {/* Open items */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionLabel}>Open Items{openItems.length > 0 ? ' (' + openItems.length + ')' : ''}</div>
          <button onClick={onAddItem} style={{ background: 'none', border: 'none', fontSize: 11, color: C.accent, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            + Add
          </button>
        </div>
        {openItems.length === 0 ? (
          <div style={{ fontSize: 12, color: C.green, padding: '8px 0' }}>All clear — no open items.</div>
        ) : (
          openItems.map(function (item) {
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: C.bgCard, border: '1px solid ' + C.border, borderRadius: 10, padding: '10px 13px', marginBottom: 6 }}>
                <div onClick={function () { onCloseItem(item.id); }} style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid ' + C.accentDim, cursor: 'pointer', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.text }}>{item.text}</div>
                  {item.due_date && (
                    <div style={{ fontSize: 10, color: C.yellow, marginTop: 3 }}>
                      Due: {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Meeting history */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionLabel}>Meeting History</div>
          <button onClick={onLogMeeting} style={{ background: 'none', border: 'none', fontSize: 11, color: C.accent, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            + Log
          </button>
        </div>
        {meetings.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted, padding: '8px 0' }}>No meetings logged yet.</div>
        ) : (
          meetings.map(function (m) {
            return (
              <div key={m.id} style={{ background: C.bgCard, border: '1px solid ' + C.border, borderRadius: 10, padding: '11px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {new Date(m.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {m.attendees && m.attendees.length > 0 && (
                      <div style={{ fontSize: 11, color: C.accent, marginTop: 4 }}>{m.attendees.join(', ')}</div>
                    )}
                    {m.notes && (
                      <div style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{m.notes}</div>
                    )}
                    {m.pip_summary && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>{m.pip_summary}</div>
                    )}
                  </div>
                  <button onClick={function () { onDeleteMeeting(m.id); }} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '0 0 0 10px', flexShrink: 0 }}>×</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <SetCadenceModal
          existing={editingCad}
          initialValues={editingCad ? null : prefillValues}
          contacts={contacts}
          onSave={function (data) { return handleSave(data); }}
          onClose={function () { setShowModal(false); setEditingCad(null); setPrefillValues(null); }}
        />
      )}
    </div>
  );
}
