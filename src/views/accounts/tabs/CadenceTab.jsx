import { useState, useEffect } from "react";
import { C } from "../../../lib/colors";
import { AmberBtn, SecBtn, DangerBtn } from "../../../components/Buttons";
import { SetCadenceModal } from "../../cadence/SetCadenceModal";
import { getNextOccurrence, getFrequencyLabel, formatTime, daysUntil, formatDateFull } from "../../../lib/cadenceUtils";

export function CadenceTab({ account, cadences, items, meetings, contacts, onAddCadence, onUpdateCadence, onDeleteCadence, onAddItem, onCloseItem, onLogMeeting, onDeleteMeeting, prefill, onPrefillHandled }) {
  var [showModal,     setShowModal]     = useState(false);
  var [editingCad,    setEditingCad]    = useState(null);
  var [prefillValues, setPrefillValues] = useState(null);
  var [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(function () {
    if (!prefill) return;
    setPrefillValues(prefill);
    setShowModal(true);
    if (onPrefillHandled) onPrefillHandled();
  }, [prefill]);

  var cadence   = cadences && cadences.length > 0 ? cadences[0] : null;
  var openItems = items.filter(function (i) { return !i.done; });
  var today     = new Date();
  today.setHours(0, 0, 0, 0);
  var nextMeeting = cadence ? getNextOccurrence(cadence, today) : null;

  function handleSave(data) {
    if (editingCad) {
      return onUpdateCadence(editingCad.id, data);
    }
    return onAddCadence(Object.assign({}, data, { account_id: account.id }));
  }

  var sectionLabel = {
    fontSize: 10, color: C.textMuted, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
  };

  if (!cadence) {
    return (
      <div>
        <div style={{ textAlign: 'center', padding: '40px 0 28px' }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>↻</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No cadence set</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>
            Set a recurring schedule to stay consistent with this account.
          </div>
          <AmberBtn onClick={function () { setShowModal(true); }}>Set Cadence</AmberBtn>
        </div>
        {showModal && (
          <SetCadenceModal
            initialValues={prefillValues}
            contacts={contacts}
            onSave={function (data) { return handleSave(data); }}
            onClose={function () { setShowModal(false); setPrefillValues(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Schedule card */}
      <div style={{
        background: C.bgCard,
        border: '1px solid ' + C.border,
        borderLeft: '3px solid ' + C.accent,
        borderRadius: 10,
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
              Cadence Schedule
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {getFrequencyLabel(cadence)}
            </div>
            {nextMeeting && (
              <div style={{ fontSize: 12, color: C.accent, marginTop: 6 }}>
                Next: {daysUntil(nextMeeting)} · {formatDateFull(nextMeeting)}
                {cadence.meeting_time ? ' · ' + formatTime(cadence.meeting_time) : ''}
              </div>
            )}
            {cadence.notes && (
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                {cadence.notes}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <SecBtn
              onClick={function () { setEditingCad(cadence); setShowModal(true); }}
              style={{ fontSize: 11, padding: '5px 10px' }}
            >
              Edit
            </SecBtn>
            {!confirmDelete ? (
              <DangerBtn
                onClick={function () { setConfirmDelete(true); }}
                style={{ fontSize: 11, padding: '5px 10px' }}
              >
                Remove
              </DangerBtn>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                <DangerBtn
                  onClick={function () { onDeleteCadence(cadence.id); setConfirmDelete(false); }}
                  style={{ fontSize: 11, padding: '5px 10px' }}
                >
                  Yes
                </DangerBtn>
                <SecBtn
                  onClick={function () { setConfirmDelete(false); }}
                  style={{ fontSize: 11, padding: '5px 10px' }}
                >
                  No
                </SecBtn>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Open items */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionLabel}>
            Open Items{openItems.length > 0 ? ' (' + openItems.length + ')' : ''}
          </div>
          <button onClick={onAddItem}
            style={{ background: 'none', border: 'none', fontSize: 11, color: C.accent, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            + Add
          </button>
        </div>

        {openItems.length === 0 ? (
          <div style={{ fontSize: 12, color: C.green, padding: '8px 0' }}>All clear — no open items.</div>
        ) : (
          openItems.map(function (item) {
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: C.bgCard, border: '1px solid ' + C.border,
                borderRadius: 10, padding: '10px 13px', marginBottom: 6,
              }}>
                <div
                  onClick={function () { onCloseItem(item.id); }}
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: '1.5px solid ' + C.accentDim,
                    cursor: 'pointer', flexShrink: 0, marginTop: 2,
                  }}
                />
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
          <button onClick={onLogMeeting}
            style={{ background: 'none', border: 'none', fontSize: 11, color: C.accent, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            + Log
          </button>
        </div>

        {meetings.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted, padding: '8px 0' }}>No meetings logged yet.</div>
        ) : (
          meetings.map(function (m) {
            return (
              <div key={m.id} style={{
                background: C.bgCard, border: '1px solid ' + C.border,
                borderRadius: 10, padding: '11px 14px', marginBottom: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {new Date(m.meeting_date + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </div>
                    {m.attendees && m.attendees.length > 0 && (
                      <div style={{ fontSize: 11, color: C.accent, marginTop: 4 }}>
                        {m.attendees.join(', ')}
                      </div>
                    )}
                    {m.notes && (
                      <div style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{m.notes}</div>
                    )}
                    {m.pip_summary && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                        {m.pip_summary}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={function () { onDeleteMeeting(m.id); }}
                    style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, padding: '0 0 0 10px', flexShrink: 0 }}
                  >
                    ×
                  </button>
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
