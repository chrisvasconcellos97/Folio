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
import { Glow } from "../../components/Glow";
import { ErrorBanner } from "../../components/ErrorBanner";
import { NavMark } from "../../components/NavMark";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";

function scrollToCadenceGroup(groupKey) {
  var el = document.querySelector('[data-cadence-group="' + groupKey + '"]');
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildGlobalCadenceInsight(cadences, handlers) {
  var seed  = "global" + new Date().getDate().toString();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var h     = handlers || {};

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

  var todayGlow = <Glow onClick={h.onClickToday}>{todayCount + " cadence" + (todayCount !== 1 ? "s" : "") + " due today"}</Glow>;
  var weekGlow  = <Glow onClick={h.onClickThisWeek}>{weekCount + " cadence" + (weekCount !== 1 ? "s" : "") + " this week"}</Glow>;

  if (todayCount > 0) {
    return pickV(seed + "gl", [
      <>{todayGlow}. Make sure you're ready.</>,
      <>{todayGlow} — don't let any of them slip.</>,
    ]);
  }
  if (weekCount > 0) {
    return pickV(seed + "gl", [
      <>{weekGlow}. Solid pipeline — block the time.</>,
      <>{weekGlow} across your accounts. Stay ready.</>,
    ]);
  }
  if (soonest) {
    var acctName = soonest.cadence.folio_accounts && soonest.cadence.folio_accounts.name
      ? soonest.cadence.folio_accounts.name
      : "your next account";
    return pickV(seed + "gl", [
      <>{cadences.length} cadence{cadences.length !== 1 ? "s" : ""} active. Next up in {soonest.daysOut} days.</>,
      <>Quiet week ahead — {acctName} is next in {soonest.daysOut} day{soonest.daysOut !== 1 ? "s" : ""}.</>,
    ]);
  }

  if (meetingCads.length > 0 && taskCads.length > 0) {
    return <>{meetingCads.length} meeting cadence{meetingCads.length !== 1 ? "s" : ""} and {taskCads.length} recurring task{taskCads.length !== 1 ? "s" : ""} across all accounts.</>;
  }
  if (taskCads.length > 0) {
    return <>{taskCads.length} recurring task{taskCads.length !== 1 ? "s" : ""} running. No meeting cadences set yet.</>;
  }
  return null;
}

/* ---- Main CadenceView ---- */
export function CadenceView({ cadences, cadencesError, onRetryCadences, accounts, onSelectAccount, addCadence, onCreateItem, onOpenHub }) {
  var [viewMode, setViewMode] = useState('list');
  var insightHandlers = {
    onClickToday:    function () { setViewMode('list'); setTimeout(function () { scrollToCadenceGroup('today'); }, 50); },
    onClickThisWeek: function () { setViewMode('week'); },
  };
  var cadenceInsight = buildGlobalCadenceInsight(cadences, insightHandlers);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, color: C.accent, flexShrink: 0 }}>
              <NavMark id="cadence" size={40} />
            </span>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
                Cadence
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>
                Recurring Schedules · {(cadences || []).length} Active
              </div>
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
        <ErrorBanner message={cadencesError ? "Couldn't load cadences — check your connection" : null} onRetry={onRetryCadences} />
        <PipInsightCard segments={[cadenceInsight]} />
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
      <PipInsightCard segments={[cadenceInsight]} />
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
