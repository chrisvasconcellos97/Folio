import { C, glass } from "../../lib/colors";
import { getFrequencyLabel, formatTime, daysUntil, formatDateFull } from "../../lib/cadenceUtils";
import { HexSignature } from "../../lib/hexMotif";

var INTER_SHARED = "'Inter', system-ui, sans-serif";

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
  padding: '6px 12px',
  minWidth: 36,
  minHeight: 32,
  fontFamily: "'Inter', system-ui, sans-serif",
};

export function CadenceEventCard({ event, onSelectAccount, onCreateItem, onOpenHub, showDate, contacts }) {
  var cadence = event.cadence;
  var account = event.account;
  var col     = eventColor(event);
  var isGlobal = cadence.is_global;
  var isTask   = cadence.type === 'task';
  var isPerson = cadence.cadence_scope === 'person' || (!cadence.account_id && cadence.contact_id);
  var personContact = isPerson && cadence.contact_id && contacts
    ? (contacts.find(function (c) { return c.id === cadence.contact_id; }) || null)
    : null;
  var name = isTask
    ? '✓ ' + (cadence.task_title || '?')
    : isPerson
      ? '1:1 · ' + (personContact ? personContact.name : 'Contact')
      : (account && account.name ? account.name : 'Unknown');

  var canOpenHub = !isTask && !isGlobal && onOpenHub;

  return (
    <div
      className="hover-lift"
      style={Object.assign({}, glass, {
        position: 'relative',
        overflow: 'hidden',
        borderLeft: '3px solid ' + col,
        boxShadow: '-2px 0 8px -3px ' + col,
        borderRadius: 8,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        cursor: canOpenHub ? 'pointer' : 'default',
      })}
      role={canOpenHub ? 'button' : undefined}
      tabIndex={canOpenHub ? 0 : undefined}
      onClick={function () { if (canOpenHub) onOpenHub(cadence); }}
      onKeyDown={function (e) {
        if (canOpenHub && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenHub(cadence);
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, letterSpacing: '-0.005em', lineHeight: 1.2 }}>{name}</div>
          {isPerson && (
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentFaint, border: '1px solid ' + C.accentLine, borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
              PERSON 1:1
            </span>
          )}
        </div>
        {cadence.type === 'task' && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isGlobal ? 'All Accounts' : (account && account.name ? account.name : '')}
          </div>
        )}
        {isPerson && personContact && personContact.title && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 3, letterSpacing: '0.04em' }}>
            {personContact.title}
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
          {!isPerson && onSelectAccount && (
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
      <HexSignature />
    </div>
  );
}

/**
 * Card for a scheduled (one-off future) meeting event on the calendar.
 * Teal-accent border, distinct from recurring cadence cards.
 *
 * Props:
 *  - meeting      The folio_meetings row (status='scheduled')
 *  - accountName  Display name of the meeting's account
 *  - onOpen(meeting)   Called when the user taps to open/start the meeting
 */
export function ScheduledMeetingCard({ meeting, accountName, onOpen }) {
  if (!meeting) return null;
  var time = meeting.meeting_time ? formatTime(meeting.meeting_time) : null;
  var methodLabel = {
    phone:     "Phone",
    in_person: "In Person",
    video:     "Video",
    email:     "Email",
  }[meeting.method] || (meeting.method || "Meeting");

  return (
    <div
      className="hover-lift"
      style={Object.assign({}, glass, {
        borderLeft: "3px solid " + C.accent,
        boxShadow: "-2px 0 8px -3px " + C.accent,
        borderRadius: 8,
        padding: "11px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: onOpen ? "pointer" : "default",
      })}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={function () { if (onOpen) onOpen(meeting); }}
      onKeyDown={function (e) {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(meeting);
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, letterSpacing: "-0.005em", lineHeight: 1.2 }}>
            {accountName || "Unknown"}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: C.accent, background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 4, padding: "1px 5px", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
            SCHEDULED
          </span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, marginTop: 3, letterSpacing: "0.04em" }}>
          {methodLabel}{time ? " · " + time : ""}
        </div>
        {meeting.agenda && (
          <div style={{ fontFamily: INTER_SHARED, fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
            {meeting.agenda}
          </div>
        )}
      </div>
      {onOpen && (
        <button
          onClick={function (e) { e.stopPropagation(); onOpen(meeting); }}
          style={{
            background: C.accentMid,
            border: "1px solid " + C.accentBorder,
            borderRadius: 7,
            padding: "5px 11px",
            fontSize: 11, fontWeight: 600,
            color: C.accent,
            fontFamily: INTER_SHARED,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Open →
        </button>
      )}
    </div>
  );
}
