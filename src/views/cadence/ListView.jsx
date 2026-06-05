import { C } from "../../lib/colors";
import { getNextOccurrence, isSameDay } from "../../lib/cadenceUtils";
import { CadenceEventCard, ScheduledMeetingCard } from "./cadenceShared";

var INTER = "'Inter', system-ui, sans-serif";
var MONO = "'JetBrains Mono', ui-monospace, monospace";

export function ListView({ cadences, onSelectAccount, onCreateItem, onOpenHub, contacts, accounts, scheduledMeetings, onOpenScheduled }) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var accountById = {};
  (accounts || []).forEach(function (a) { accountById[a.id] = a; });

  // Cadence items
  var cadenceItems = (cadences || []).map(function (cadence) {
    var next = getNextOccurrence(cadence, today);
    var acct = cadence.folio_accounts;
    return next ? { type: 'cadence', cadence: cadence, next: next, account: acct } : null;
  }).filter(Boolean);

  // Scheduled one-off meeting items
  var scheduledItems = (scheduledMeetings || []).map(function (m) {
    if (!m.meeting_date) return null;
    var d = new Date(m.meeting_date + "T00:00:00");
    return { type: 'scheduled', meeting: m, next: d };
  }).filter(Boolean);

  // Merge and sort by date
  var allItems = cadenceItems.concat(scheduledItems);
  allItems.sort(function (a, b) { return a.next - b.next; });

  var endOfToday    = new Date(today); endOfToday.setHours(23, 59, 59);
  var endOfWeek     = new Date(today); endOfWeek.setDate(today.getDate() + (6 - today.getDay())); endOfWeek.setHours(23, 59, 59);
  var endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  var groups = [
    { key: 'today',    label: 'TODAY',     items: [] },
    { key: 'week',     label: 'THIS WEEK', items: [] },
    { key: 'nextweek', label: 'NEXT WEEK', items: [] },
    { key: 'later',    label: 'LATER',     items: [] },
  ];

  allItems.forEach(function (item) {
    var d = new Date(item.next); d.setHours(0, 0, 0, 0);
    if (isSameDay(d, today))     groups[0].items.push(item);
    else if (d <= endOfWeek)     groups[1].items.push(item);
    else if (d <= endOfNextWeek) groups[2].items.push(item);
    else                         groups[3].items.push(item);
  });

  var filled = groups.filter(function (g) { return g.items.length > 0; });

  if (filled.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontFamily: INTER, fontSize: 13 }}>
        Nothing scheduled. Set a cadence or schedule a one-off meeting to get started.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {filled.map(function (group) {
        return (
          <div key={group.key} data-cadence-group={group.key}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(function (item) {
                if (item.type === 'scheduled') {
                  var acct = accountById[item.meeting.account_id];
                  return (
                    <ScheduledMeetingCard
                      key={item.meeting.id}
                      meeting={item.meeting}
                      accountName={acct ? acct.name : "Unknown"}
                      onOpen={onOpenScheduled}
                    />
                  );
                }
                return (
                  <CadenceEventCard
                    key={item.cadence.id}
                    event={{ cadence: item.cadence, date: item.next, account: item.account }}
                    onSelectAccount={onSelectAccount}
                    onCreateItem={onCreateItem}
                    onOpenHub={onOpenHub}
                    showDate
                    contacts={contacts}
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
