import { C, glass } from "../../lib/colors";
import { getFrequencyLabel, formatTime, daysUntil, formatDateFull } from "../../lib/cadenceUtils";

export var ACCOUNT_COLORS = [C.accent, C.green, C.blue, C.purple];

export function accountColor(id) {
  if (!id) return C.accent;
  var hash = id.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length];
}

export function eventColor(event) {
  return event.cadence.type === 'task' ? C.yellow : accountColor(event.cadence.account_id);
}

export var navBtnStyle = {
  background: 'none',
  border: '1px solid ' + C.border,
  borderRadius: 6,
  color: C.textSub,
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '3px 10px',
  fontFamily: "'Inter', system-ui, sans-serif",
};

export function CadenceEventCard({ event, onSelectAccount, onCreateItem, showDate }) {
  var cadence = event.cadence;
  var account = event.account;
  var col     = eventColor(event);
  var isGlobal = cadence.is_global;
  var name = cadence.type === 'task'
    ? '✓ ' + (cadence.task_title || '?')
    : (account && account.name ? account.name : 'Unknown');

  return (
    <div style={Object.assign({}, glass, {
      borderLeft: '3px solid ' + col,
      borderRadius: 8,
      padding: '11px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    })}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</div>
        {cadence.type === 'task' && (
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
            {isGlobal ? 'All Accounts' : (account && account.name ? account.name : '')}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
          {getFrequencyLabel(cadence)}
        </div>
        {showDate && event.date && (
          <div style={{ fontSize: 11, color: col, marginTop: 3 }}>
            {daysUntil(event.date)} · {formatDateFull(event.date)}
            {cadence.meeting_time ? ' · ' + formatTime(cadence.meeting_time) : ''}
          </div>
        )}
        {cadence.type === 'task' && onCreateItem && (
          <button
            onClick={function (e) { e.stopPropagation(); onCreateItem(cadence); }}
            style={{
              background: C.accentFaint, border: '1px solid ' + C.accentLine,
              borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
              color: C.accent, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer',
              marginTop: 6, display: 'block',
            }}
          >
            + Log Task
          </button>
        )}
      </div>
      {onSelectAccount && !isGlobal && (
        <button
          onClick={function () { onSelectAccount(cadence.account_id); }}
          style={{
            background: col + '18',
            border: '1px solid ' + col + '44',
            borderRadius: 7,
            padding: '5px 11px',
            fontSize: 11,
            color: col,
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          View →
        </button>
      )}
    </div>
  );
}
