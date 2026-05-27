import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";
import { PipMark } from "../../components/PipMark";
import { PipInsightCard } from "../../components/PipInsightCard";
import { SetCadenceModal } from "./SetCadenceModal";
import {
  getOccurrencesInRange, getNextOccurrence,
  startOfWeek,
} from "../../lib/cadenceUtils";
import { pickV } from "../../lib/metricsUtils";
import { CalendarView } from "./CalendarView";
import { WeekView } from "./WeekView";
import { ListView } from "./ListView";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

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

/* ---- Main CadenceView ---- */
export function CadenceView({ cadences, accounts, onSelectAccount, addCadence, onCreateItem, onOpenHub }) {
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
        evts.push({ cadence: cadence, date: date, account: acct });
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
              flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
              fontFamily: MONO,
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: active ? 700 : 500,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
              Cadence
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
              Recurring Schedules · {(cadences || []).length} Active
            </div>
          </div>
          <button
            onClick={function () { setShowAddModal(true); }}
            style={{
              background: C.accentDeep || C.accent,
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              color: C.bg,
              fontFamily: INTER,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Cadence
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
            Recurring Schedules · {(cadences || []).length} Active
          </div>
        </div>
        <button
          onClick={function () { setShowAddModal(true); }}
          style={{
            background: C.accentDeep || C.accent,
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            color: C.bg,
            fontFamily: INTER,
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
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
          onOpenHub={onOpenHub}
        />
      )}

      {viewMode === 'week' && (
        <WeekView
          weekStart={weekDate} weekEnd={weekEnd} events={weekEvents}
          onPrev={function () { var d = new Date(weekDate); d.setDate(d.getDate() - 7); setWeekDate(d); }}
          onNext={function () { var d = new Date(weekDate); d.setDate(d.getDate() + 7); setWeekDate(d); }}
          onSelectAccount={onSelectAccount}
          onOpenHub={onOpenHub}
        />
      )}

      {viewMode === 'list' && (
        <ListView cadences={cadences} onSelectAccount={onSelectAccount} onCreateItem={onCreateItem} onOpenHub={onOpenHub} />
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
