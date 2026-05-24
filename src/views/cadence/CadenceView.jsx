import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { PipMark } from "../../components/PipMark";
import { PipInsightCard } from "../../components/PipInsightCard";
import { SetCadenceModal } from "./SetCadenceModal";
import {
  getOccurrencesInRange, getNextOccurrence, getFrequencyLabel,
  formatTime, daysUntil, formatDateFull, isSameDay,
  startOfWeek, getCalendarGrid, DAYS_SHORT, MONTHS,
} from "../../lib/cadenceUtils";
import { pickV } from "../../lib/metricsUtils";

function buildGlobalCadenceInsight(cadences) {
  var seed  = "global" + new Date().getDate().toString();
  var today = new Date(); today.setHours(0, 0, 0, 0);

  if (!cadences || cadences.length === 0) {
    return pickV(seed + "g0", [
      "No cadences set yet. Open an account and set a recurring meeting or task to get started.",
      "Nothing scheduled across your accounts. A cadence keeps you from going dark on the accounts that matter.",
    ]);
  }

  var taskCads    = cadences.filter(function (c) { return c.type === 'task'; });
  var meetingCads = cadences.filter(function (c) { return c.type !== 'task'; });

  var upcoming = cadences.map(function (c) {
    var next = getNextOccurrence(c, today);
    return next ? { cadence: c, daysOut: Math.round((next - today) / 86400000) } : null;
  }).filter(Boolean).sort(function (a, b) { return a.daysOut - b.daysOut; });

  var todayCount = upcoming.filter(function (u) { return u.daysOut === 0; }).length;
  var weekCount  = upcoming.filter(function (u) { return u.daysOut <= 7; }).length;
  var soonest    = upcoming.length > 0 ? upcoming[0] : null;

  var parts = [];

  // Lead — today vs this week vs general
  if (todayCount > 0) {
    parts.push(pickV(seed + "gl", [
      todayCount + " cadence" + (todayCount !== 1 ? "s" : "") + " due today. Make sure you're ready.",
      todayCount === 1 ? "One on the schedule today. Don't let it slip." : todayCount + " things on the board today.",
    ]));
  } else if (weekCount > 0) {
    parts.push(pickV(seed + "gl", [
      weekCount + " coming up this week across your accounts.",
      "This week has " + weekCount + " cadence" + (weekCount !== 1 ? "s" : "") + " lined up. Solid pipeline.",
    ]));
  } else if (soonest) {
    var acctName = soonest.cadence.folio_accounts && soonest.cadence.folio_accounts.name
      ? soonest.cadence.folio_accounts.name
      : "your next account";
    parts.push(pickV(seed + "gl", [
      cadences.length + " cadence" + (cadences.length !== 1 ? "s" : "") + " active. Next up in " + soonest.daysOut + " days.",
      "Quiet week ahead — " + acctName + " is next in " + soonest.daysOut + " day" + (soonest.daysOut !== 1 ? "s" : "") + ".",
    ]));
  }

  // Secondary — mix context
  if (meetingCads.length > 0 && taskCads.length > 0) {
    parts.push(pickV(seed + "gs", [
      meetingCads.length + " meeting cadence" + (meetingCads.length !== 1 ? "s" : "") + " and " + taskCads.length + " recurring task" + (taskCads.length !== 1 ? "s" : "") + " across all accounts.",
      "Good mix — meetings and tasks both tracked.",
    ]));
  } else if (taskCads.length > 0) {
    parts.push(pickV(seed + "gs", [
      taskCads.length + " recurring task" + (taskCads.length !== 1 ? "s" : "") + " running. No meeting cadences set.",
      "All tasks, no meeting cadences — consider setting a check-in frequency for your key accounts.",
    ]));
  }

  return parts.join(" ");
}

var ACCOUNT_COLORS = [C.accent, C.green, C.blue, C.purple];

function accountColor(id) {
  if (!id) return C.accent;
  var hash = id.split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length];
}

function eventColor(event) {
  return event.cadence.type === 'task' ? C.yellow : accountColor(event.cadence.account_id);
}

var navBtnStyle = {
  background: 'none',
  border: '1px solid ' + C.border,
  borderRadius: 6,
  color: C.textSub,
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '3px 10px',
  fontFamily: "'DM Sans', sans-serif",
};

/* ---- Shared event card ---- */
function CadenceEventCard({ event, onSelectAccount, onCreateItem, showDate }) {
  var cadence = event.cadence;
  var account = event.account;
  var col     = eventColor(event);
  var isGlobal = cadence.is_global;
  var name = cadence.type === 'task'
    ? '✓ ' + (cadence.task_title || '?')
    : (account && account.name ? account.name : 'Unknown');

  return (
    <div style={{
      background: C.bgCard,
      border: '1px solid ' + C.border,
      borderLeft: '3px solid ' + col,
      borderRadius: 8,
      padding: '11px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
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
              color: C.accent, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
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
            fontFamily: "'DM Sans', sans-serif",
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

/* ---- Calendar view ---- */
function CalendarView({ year, month, events, onPrev, onNext, onSelectAccount, onCreateItem }) {
  var today    = new Date();
  var grid     = getCalendarGrid(year, month);
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
                  var name = ev.cadence.type === 'task'
                    ? ('✓ ' + (ev.cadence.task_title || '?')).slice(0, 11)
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
              return <CadenceEventCard key={ev.cadence.id + "-sel-" + i} event={ev} onSelectAccount={onSelectAccount} onCreateItem={onCreateItem} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Week view ---- */
function WeekView({ weekStart, weekEnd, events, onPrev, onNext, onSelectAccount }) {
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
          var isToday  = isSameDay(day, today);
          var evts     = dayEvents(day);

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
                  var name = ev.cadence.type === 'task'
                    ? '✓ ' + (ev.cadence.task_title || '?')
                    : (ev.account && ev.account.name ? ev.account.name : '?');
                  var time = ev.cadence.meeting_time ? formatTime(ev.cadence.meeting_time) : '';
                  return (
                    <div key={ev.cadence.id + "-" + j}
                      onClick={function () { onSelectAccount && onSelectAccount(ev.cadence.account_id); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAccount && onSelectAccount(ev.cadence.account_id); } }}
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

/* ---- List view ---- */
function ListView({ cadences, onSelectAccount, onCreateItem }) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var items = cadences.map(function (cadence) {
    var next = getNextOccurrence(cadence, today);
    var acct = cadence.folio_accounts;
    return { cadence, next, account: acct };
  }).filter(function (item) { return item.next; });

  items.sort(function (a, b) { return a.next - b.next; });

  var endOfToday    = new Date(today); endOfToday.setHours(23, 59, 59);
  var endOfWeek     = new Date(today); endOfWeek.setDate(today.getDate() + (6 - today.getDay())); endOfWeek.setHours(23, 59, 59);
  var endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  var groups = [
    { key: 'today',    label: 'TODAY',     items: [] },
    { key: 'week',     label: 'THIS WEEK', items: [] },
    { key: 'nextweek', label: 'NEXT WEEK', items: [] },
    { key: 'later',    label: 'LATER',     items: [] },
  ];

  items.forEach(function (item) {
    var d = new Date(item.next); d.setHours(0, 0, 0, 0);
    if (isSameDay(d, today))    groups[0].items.push(item);
    else if (d <= endOfWeek)    groups[1].items.push(item);
    else if (d <= endOfNextWeek) groups[2].items.push(item);
    else                        groups[3].items.push(item);
  });

  var filled = groups.filter(function (g) { return g.items.length > 0; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {filled.map(function (group) {
        return (
          <div key={group.key}>
            <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(function (item) {
                return (
                  <CadenceEventCard
                    key={item.cadence.id}
                    event={{ cadence: item.cadence, date: item.next, account: item.account }}
                    onSelectAccount={onSelectAccount}
                    onCreateItem={onCreateItem}
                    showDate
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Main CadenceView ---- */
export function CadenceView({ cadences, accounts, onSelectAccount, addCadence, onCreateItem }) {
  var cadenceInsight = useMemo(function () { return buildGlobalCadenceInsight(cadences); }, [cadences]);
  var [viewMode, setViewMode] = useState('list');
  var [showAddModal, setShowAddModal] = useState(false);
  var [calDate,  setCalDate]  = useState(function () {
    var d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  var [weekDate, setWeekDate] = useState(function () { return startOfWeek(new Date()); });

  var calYear  = calDate.getFullYear();
  var calMonth = calDate.getMonth();
  var weekEnd  = new Date(weekDate); weekEnd.setDate(weekDate.getDate() + 6);

  function getEventsForRange(start, end) {
    var evts = [];
    (cadences || []).forEach(function (cadence) {
      var acct = cadence.folio_accounts;
      getOccurrencesInRange(cadence, start, end).forEach(function (date) {
        evts.push({ cadence, date, account: acct });
      });
    });
    evts.sort(function (a, b) { return a.date - b.date; });
    return evts;
  }

  var calEvents  = getEventsForRange(new Date(calYear, calMonth, 1), new Date(calYear, calMonth + 1, 0));
  var weekEvents = getEventsForRange(weekDate, weekEnd);

  var viewToggle = (
    <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
      {[['calendar', 'Calendar'], ['week', 'Week'], ['list', 'List']].map(function (pair) {
        var active = viewMode === pair[0];
        return (
          <button key={pair[0]} onClick={function () { setViewMode(pair[0]); }}
            style={{
              flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 600 : 400,
              fontFamily: "'DM Sans', sans-serif",
              background: active ? C.bgCardAlt : 'transparent',
              color: active ? C.accent : C.textMuted,
              border: '1px solid ' + (active ? C.border : 'transparent'),
            }}
          >
            {pair[1]}
          </button>
        );
      })}
    </div>
  );

  if (!cadences || cadences.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Cadence</div>
          <button
            onClick={function () { setShowAddModal(true); }}
            style={{
              background: C.accentGlow, border: '1px solid ' + C.accentSubtle,
              borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
              color: C.accent, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            + Set Cadence
          </button>
        </div>
        <PipInsightCard text={cadenceInsight} />
        {viewToggle}
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMuted }}>
          <PipMark size={16} color={C.accentDim} glow />
          <div style={{ marginTop: 12, fontSize: 14, color: C.textMuted }}>No cadences set yet</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Open an account and set a cadence to get started.</div>
        </div>
        {showAddModal && addCadence && (
          <SetCadenceModal
            accounts={accounts}
            onSave={function (data) {
              var ids = data.account_ids;
              var rest = Object.assign({}, data);
              delete rest.account_ids;
              if (ids && accounts && ids.length === accounts.length && rest.type === 'task') {
                return addCadence(Object.assign({}, rest, { is_global: true, account_id: null }))
                  .then(function () { setShowAddModal(false); showToast("Cadence set"); });
              }
              var saves = ids
                ? ids.map(function (id) { return addCadence(Object.assign({}, rest, { account_id: id })); })
                : [addCadence(data)];
              return Promise.all(saves).then(function () { setShowAddModal(false); showToast("Cadence set"); });
            }}
            onClose={function () { setShowAddModal(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Cadence</div>
        <button
          onClick={function () { setShowAddModal(true); }}
          style={{
            background: C.accentGlow, border: '1px solid ' + C.accentSubtle,
            borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
            color: C.accent, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}
        >
          + Set Cadence
        </button>
      </div>
      <PipInsightCard text={buildGlobalCadenceInsight(cadences)} />
      {viewToggle}

      {viewMode === 'calendar' && (
        <CalendarView
          year={calYear} month={calMonth} events={calEvents}
          onPrev={function () { setCalDate(new Date(calYear, calMonth - 1, 1)); }}
          onNext={function () { setCalDate(new Date(calYear, calMonth + 1, 1)); }}
          onSelectAccount={onSelectAccount}
          onCreateItem={onCreateItem}
        />
      )}

      {viewMode === 'week' && (
        <WeekView
          weekStart={weekDate} weekEnd={weekEnd} events={weekEvents}
          onPrev={function () { var d = new Date(weekDate); d.setDate(d.getDate() - 7); setWeekDate(d); }}
          onNext={function () { var d = new Date(weekDate); d.setDate(d.getDate() + 7); setWeekDate(d); }}
          onSelectAccount={onSelectAccount}
        />
      )}

      {viewMode === 'list' && (
        <ListView cadences={cadences} onSelectAccount={onSelectAccount} onCreateItem={onCreateItem} />
      )}

      {showAddModal && (
        <SetCadenceModal
          accounts={accounts}
          onSave={function (data) {
            var ids = data.account_ids;
            var rest = Object.assign({}, data);
            delete rest.account_ids;
            if (ids && accounts && ids.length === accounts.length && rest.type === 'task') {
              return addCadence(Object.assign({}, rest, { is_global: true, account_id: null }))
                .then(function () { setShowAddModal(false); showToast("Cadence set"); });
            }
            var saves = ids
              ? ids.map(function (id) { return addCadence(Object.assign({}, rest, { account_id: id })); })
              : [addCadence(data)];
            return Promise.all(saves).then(function () { setShowAddModal(false); showToast("Cadence set"); });
          }}
          onClose={function () { setShowAddModal(false); }}
        />
      )}
    </div>
  );
}
