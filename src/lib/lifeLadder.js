// Life module logic: when does an item next come up, what heads-up stage is it
// in (the VIP escalating ladder), and how should the honey-do list be ordered.
// Pure functions — no I/O — so they're easy to reason about and test.

function startOfToday() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(d) {
  if (!d) return null;
  // Treat YYYY-MM-DD as a local calendar day (avoid TZ off-by-one).
  var parts = String(d).slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// The next calendar occurrence of an item. One-offs return their date if today
// or future (else null — it's past). Annual-recurring events roll forward to
// this year's or next year's anniversary of the stored month/day.
export function nextOccurrence(item, from) {
  var base = parseDate(item.item_date);
  if (!base) return null;
  var today = from || startOfToday();

  if (item.recurrence === "annual") {
    var occ = new Date(today.getFullYear(), base.getMonth(), base.getDate());
    if (occ < today) occ = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
    return occ;
  }
  // One-off — only "upcoming" if it's today or later.
  if (base < today) return null;
  return base;
}

export function daysUntil(item, from) {
  var occ = nextOccurrence(item, from);
  if (!occ) return null;
  var today = from || startOfToday();
  return Math.round((occ.getTime() - today.getTime()) / 86400000);
}

// VIP events escalate over weeks; normal events get a short runway. Returns the
// nearest crossed stage as a { key, label } or null if nothing's due yet.
export function headsUp(item, from) {
  var d = daysUntil(item, from);
  if (d === null || d < 0) return null;
  var vip = item.importance === "vip";

  if (d === 0) return { key: "today", label: "Today" };
  if (d === 1) return { key: "tomorrow", label: "Tomorrow" };
  if (d <= 3) return { key: "soon", label: vip ? d + " days — order now so it arrives in time" : d + " days out" };
  if (d <= 7) return { key: "week", label: vip ? "One week out — got a plan?" : d + " days out" };
  if (vip && d <= 24) return { key: "early", label: "~3 weeks out — start thinking" };
  return null; // too far out to nag yet
}

// Appointments + events that are coming up (within `horizon` days, default 45),
// soonest first, each decorated with daysUntil + headsUp.
export function upcomingItems(items, horizon) {
  horizon = horizon || 45;
  var today = startOfToday();
  return (items || [])
    .filter(function (it) { return it.status !== "done" && it.status !== "archived" && (it.kind === "appointment" || it.kind === "event"); })
    .map(function (it) {
      var d = daysUntil(it, today);
      return { item: it, daysUntil: d, headsUp: headsUp(it, today) };
    })
    .filter(function (row) {
      // VIP events get the long lead; everything else inside the horizon.
      if (row.daysUntil === null || row.daysUntil < 0) return false;
      var maxLead = (row.item.importance === "vip") ? Math.max(horizon, 30) : horizon;
      return row.daysUntil <= maxLead;
    })
    .sort(function (a, b) { return a.daysUntil - b.daysUntil; });
}

var COMPLEXITY_WEIGHT = { big: 14, medium: 7, small: 0 };

// Honey-do ordering: a blend of how long it's been open (aging) and how big the
// job is, so old + heavy projects bubble up. Returns open todos, highest score
// first, each decorated with ageDays.
export function honeyDoSorted(items) {
  var now = Date.now();
  return (items || [])
    .filter(function (it) { return it.kind === "todo" && it.status !== "done" && it.status !== "archived"; })
    .map(function (it) {
      var opened = it.opened_at ? new Date(it.opened_at).getTime() : (it.created_at ? new Date(it.created_at).getTime() : now);
      var ageDays = Math.max(0, Math.floor((now - opened) / 86400000));
      var score = ageDays + (COMPLEXITY_WEIGHT[it.complexity] || 0);
      return { item: it, ageDays: ageDays, score: score };
    })
    .sort(function (a, b) { return b.score - a.score; });
}
