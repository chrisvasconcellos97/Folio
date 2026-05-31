import { useState } from "react";
import { C } from "../../lib/colors";
import { isSameDay, formatDateFull, getCalendarGrid, DAYS_SHORT, MONTHS } from "../../lib/cadenceUtils";
import { CadenceEventCard, eventColor, navBtnStyle } from "./cadenceShared";

export function CalendarView({ year, month, events, onPrev, onNext, onSelectAccount, onCreateItem, onOpenHub, contacts }) {
  var today = new Date();
  var grid  = getCalendarGrid(year, month);
  var [selectedDay, setSelectedDay] = useState(null);

  function dayEvents(date) {
    return events.filter(function (e) { return isSameDay(e.date, date); });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={onPrev} aria-label="Previous" style={navBtnStyle}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {MONTHS[month] + ' ' + year}
        </span>
        <button onClick={onNext} aria-label="Next" style={navBtnStyle}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS_SHORT.map(function (d) {
          return (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, color: C.textMuted, fontWeight: 600, padding: '3px 0' }}>
              {d}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {grid.map(function (date) {
          var inMonth  = date.getMonth() === month;
          var isToday  = isSameDay(date, today);
          var evts     = dayEvents(date);
          var selected = selectedDay && isSameDay(date, selectedDay);

          return (
            <div
              key={date.toISOString().slice(0, 10)}
              onClick={function () { if (evts.length > 0) setSelectedDay(selected ? null : date); }}
              role={evts.length > 0 ? "button" : undefined}
              tabIndex={evts.length > 0 ? 0 : undefined}
              onKeyDown={evts.length > 0 ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDay(selected ? null : date); } } : undefined}
              style={{
                minHeight: 58,
                background: selected ? C.accentFaint : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (selected ? C.accentSubtle : C.border),
                borderRadius: 6,
                padding: '5px 5px 4px',
                cursor: evts.length > 0 ? 'pointer' : 'default',
                opacity: inMonth ? 1 : 0.25,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
                {isToday ? (
                  <span style={{
                    background: C.accent, color: '#000',
                    width: 18, height: 18, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  }}>
                    {date.getDate()}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: C.textSub, fontVariantNumeric: "tabular-nums" }}>{date.getDate()}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {evts.slice(0, 2).map(function (ev, j) {
                  var col  = eventColor(ev);
                  var isPerson = ev.cadence.cadence_scope === 'person' || (!ev.cadence.account_id && ev.cadence.contact_id);
                  var personContact = isPerson && ev.cadence.contact_id && contacts
                    ? (contacts.find(function (c) { return c.id === ev.cadence.contact_id; }) || null)
                    : null;
                  var name = ev.cadence.type === 'task'
                    ? ('✓ ' + (ev.cadence.task_title || '?')).slice(0, 11)
                    : isPerson
                      ? ('1:1 · ' + (personContact ? personContact.name : 'Contact')).slice(0, 11)
                      : (ev.account && ev.account.name ? ev.account.name.slice(0, 9) : '?');
                  return (
                    <div key={ev.cadence.id + "-" + j} style={{
                      background: col + '22', color: col,
                      borderRadius: 3, padding: '1px 4px',
                      fontSize: 9, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {name}
                    </div>
                  );
                })}
                {evts.length > 2 && (
                  <div style={{ fontSize: 9, color: C.textMuted, paddingLeft: 2 }}>+{evts.length - 2}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && dayEvents(selectedDay).length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid ' + C.border, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
            {formatDateFull(selectedDay)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayEvents(selectedDay).map(function (ev, i) {
              return <CadenceEventCard key={ev.cadence.id + "-sel-" + i} event={ev} onSelectAccount={onSelectAccount} onCreateItem={onCreateItem} onOpenHub={onOpenHub} contacts={contacts} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
