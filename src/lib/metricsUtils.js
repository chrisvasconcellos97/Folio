function sortedRecords(list, accountId) {
  return list
    .filter(function (r) { return r.account_id === accountId; })
    .sort(function (a, b) { return a.year !== b.year ? a.year - b.year : a.month - b.month; });
}

export function latestRecord(list, accountId) {
  var recs = sortedRecords(list, accountId);
  return recs.length > 0 ? recs[recs.length - 1] : null;
}

export function accountRecords(list, accountId) {
  return sortedRecords(list, accountId);
}

function findRecord(list, accountId, month, year) {
  return list.find(function (r) {
    return r.account_id === accountId && r.month === month && r.year === year;
  }) || null;
}

function prevMonthOf(month, year) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year: year };
}

export function momPct(list, accountId, field) {
  var latest = latestRecord(list, accountId);
  if (!latest) return null;
  var prev = prevMonthOf(latest.month, latest.year);
  var prevRec = findRecord(list, accountId, prev.month, prev.year);
  if (!prevRec || prevRec[field] === 0) return null;
  return Math.round(((latest[field] - prevRec[field]) / prevRec[field]) * 100);
}

export function yoyPct(list, accountId, field) {
  var latest = latestRecord(list, accountId);
  if (!latest) return null;
  var prevRec = findRecord(list, accountId, latest.month, latest.year - 1);
  if (!prevRec || prevRec[field] === 0) return null;
  return Math.round(((latest[field] - prevRec[field]) / prevRec[field]) * 100);
}

export function momDelta(list, accountId, field) {
  var latest = latestRecord(list, accountId);
  if (!latest) return null;
  var prev = prevMonthOf(latest.month, latest.year);
  var prevRec = findRecord(list, accountId, prev.month, prev.year);
  if (!prevRec) return null;
  return latest[field] - prevRec[field];
}

export function fmtRevenue(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + Math.round(n).toLocaleString();
}

export function fmtPct(pct) {
  if (pct === null || pct === undefined) return null;
  return (pct >= 0 ? "↑" : "↓") + Math.abs(pct) + "%";
}

export function fmtDelta(delta) {
  if (delta === null || delta === undefined) return null;
  return (delta >= 0 ? "↑" : "↓") + Math.abs(delta);
}

export var MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
