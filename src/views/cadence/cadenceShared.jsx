import { C, glass } from "../../lib/colors";
import { getFrequencyLabel, formatTime, daysUntil, formatDateFull } from "../../lib/cadenceUtils";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

export var ACCOUNT_COLORS = [C.accent, C.green, C.blue, C.purple];

// Per-accent surface tints, theme-aware via CSS vars. Dark uses L≈0.18
// hue-shifted backgrounds; light uses L≈0.97 paper-tone washes. Keyed by
// the C-token reference string so the lookup is stable across themes.
var TINT_BY_HEX = {};
TINT_BY_HEX[C.accent] = "var(--c-cadence-tint-accent)";
TINT_BY_HEX[C.green]  = "var(--c-cadence-tint-green)";
TINT_BY_HEX[C.blue]   = "var(--c-cadence-tint-blue)";
TINT_BY_HEX[C.purple] = "var(--c-cadence-tint-purple)";
TINT_BY_HEX[C.yellow] = "var(--c-cadence-tint-yellow)";

export function accountColor(id) {
  if (!id) return C.accent;
  var hash = id.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length];
}

export function eventColor(event) {
  return event.cadence.type === 'task' ? C.yellow : accountColor(event.cadence.account_id);
}

export function eventTint(event) {
  return TINT_BY_HEX[eventColor(event)] || C.surface;
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

export function CadenceEventCard({ event, onSelectAccount, onCreateItem, onOpenHub, showDate }) {
  var cadence = event.cadence;
  var account = event.account;
  var col     = eventColor(event);
  var isGlobal = cadence.is_global;
  var isTask   = cadence.type === 'task';
  var name = isTask
    ? '✓ ' + (cadence.task_title || '?')
    : (account && account.name ? account.name : 'Unknown');

  var tint = eventTint(event);
  return (
    <div
      style={Object.assign({}, glass, {
        background: tint,
        borderLeft: '3px solid ' + col,
        borderRadius: 8,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        cursor: !isTask && !isGlobal && onOpenHub ? 'pointer' : 'default',
      })}
      role={!isTask && !isGlobal && onOpenHub ? 'button' : undefined}
      tabIndex={!isTask && !isGlobal && onOpenHub ? 0 : undefined}
      onClick={function () { if (!isTask && !isGlobal && onOpenHub) onOpenHub(cadence); }}
      onKeyDown={function (e) {
        if (!isTask && !isGlobal && onOpenHub && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenHub(cadence);
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, letterSpacing: '-0.005em', lineHeight: 1.2 }}>{name}</div>
        {cadence.type === 'task' && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isGlobal ? 'All Accounts' : (account && account.name ? account.name : '')}
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 4, letterSpacing: '0.04em' }}>
          {getFrequencyLabel(cadence)}
        </div>
        {showDate && event.date && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: col, marginTop: 4, letterSpacing: '0.04em', fontFeatureSettings: '"tnum"' }}>
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
      {!isGlobal && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!isTask && onOpenHub && (
            <button
              onClick={function (e) { e.stopPropagation(); onOpenHub(cadence); }}
              style={{
                background: col + '18',
                border: '1px solid ' + col + '44',
                borderRadius: 7,
                padding: '5px 11px',
                fontSize: 11, fontWeight: 600,
                color: col,
                fontFamily: "'Inter', system-ui, sans-serif",
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Open Hub →
            </button>
          )}
          {onSelectAccount && (
            <button
              onClick={function (e) { e.stopPropagation(); onSelectAccount(cadence.account_id); }}
              style={{
                background: 'transparent',
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
              Account
            </button>
          )}
        </div>
      )}
    </div>
  );
}
