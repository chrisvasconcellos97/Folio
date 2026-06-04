import { C } from "../../lib/colors";
import { isSameDay, formatTime, DAYS_SHORT, MONTHS } from "../../lib/cadenceUtils";
import { eventColor, navBtnStyle } from "./cadenceShared";

export function WeekView({ weekStart, weekEnd, events, onPrev, onNext, onSelectAccount, onOpenHub, contacts }) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  function dayEvents(date) {
    return events.filter(function (e) { return isSameDay(e.date, date); });
  }

  var wLabel = MONTHS[weekStart.getMonth()].slice(0, 3) + ' ' + weekStart.getDate() +
    ' – ' + MONTHS[weekEnd.getMonth()].slice(0, 3) + ' ' + weekEnd.getDate() + ', ' + weekEnd.getFullYear();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={onPrev} aria-label="Previous" style={navBtnStyle}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{wLabel}</span>
        <button onClick={onNext} aria-label="Next" style={navBtnStyle}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map(function (day) {
          var isToday = isSameDay(day, today);
          var evts    = dayEvents(day);

          return (
            <div key={day.toISOString().slice(0, 10)} style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid ' + (isToday ? C.accentSubtle : C.border),
              borderRadius: 8,
              padding: '8px 5px',
              minHeight: 90,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
                  {DAYS_SHORT[day.getDay()]}
                </div>
                <div style={{
                  fontSize: 14, marginTop: 2,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? C.accent : C.text,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {day.getDate()}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {evts.map(function (ev, j) {
                  var col  = eventColor(ev);
                  var isPerson = ev.cadence.cadence_scope === 'person' || (!ev.cadence.account_id && ev.cadence.contact_id);
                  var personContact = isPerson && ev.cadence.contact_id && contacts
                    ? (contacts.find(function (c) { return c.id === ev.cadence.contact_id; }) || null)
                    : null;
                  var name = ev.cadence.type === 'task'
                    ? '✓ ' + (ev.cadence.task_title || '?')
                    : isPerson
                      ? '1:1 · ' + (personContact ? personContact.name : 'Contact')
                      : (ev.account && ev.account.name ? ev.account.name : '?');
                  var time = ev.cadence.meeting_time ? formatTime(ev.cadence.meeting_time) : '';
                  return (
                    <div key={ev.cadence.id + "-" + j}
                      onClick={function () {
                        if (ev.cadence.type !== 'task' && onOpenHub) onOpenHub(ev.cadence);
                        else if (onSelectAccount && ev.cadence.account_id) onSelectAccount(ev.cadence.account_id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={function (e) {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (ev.cadence.type !== 'task' && onOpenHub) onOpenHub(ev.cadence);
                        else if (onSelectAccount && ev.cadence.account_id) onSelectAccount(ev.cadence.account_id);
                      }}
                      style={{
                        background: col + '18', border: '1px solid ' + col + '44',
                        borderRadius: 5, padding: '4px 5px', cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </div>
                      {time && <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{time}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
