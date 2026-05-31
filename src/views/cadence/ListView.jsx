import { C } from "../../lib/colors";
import { getNextOccurrence, isSameDay } from "../../lib/cadenceUtils";
import { CadenceEventCard } from "./cadenceShared";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

export function ListView({ cadences, onSelectAccount, onCreateItem, onOpenHub, contacts }) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var items = cadences.map(function (cadence) {
    var next = getNextOccurrence(cadence, today);
    var acct = cadence.folio_accounts;
    return { cadence: cadence, next: next, account: acct };
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
    if (isSameDay(d, today))     groups[0].items.push(item);
    else if (d <= endOfWeek)     groups[1].items.push(item);
    else if (d <= endOfNextWeek) groups[2].items.push(item);
    else                         groups[3].items.push(item);
  });

  var filled = groups.filter(function (g) { return g.items.length > 0; });

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
