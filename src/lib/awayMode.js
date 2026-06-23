// PTO / Away Mode (#50) — pure helpers over a user's away periods so silence
// during a vacation reads as "you were out", not "you dropped the ball".
//
// An away period is { start_date, end_date } (inclusive, YYYY-MM-DD). These
// functions never touch the network/DB — surfaces feed them the periods they
// already loaded. DATA LINE: away windows are personal scheduling, not OEC data.

import { toLocalDate } from "./dateUtils.js";

var DAY_MS = 24 * 60 * 60 * 1000;

function startMs(p) {
  var d = toLocalDate(p.start_date);
  return d ? d.getTime() : null;
}
// End of the away day (inclusive) — being out THROUGH end_date covers all of it.
function endMs(p) {
  var d = toLocalDate(p.end_date);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime() : null;
}

// Was the user away on a given date (YYYY-MM-DD or Date)?
export function isAwayOn(date, periods) {
  if (!date) return false;
  var d = toLocalDate(date);
  if (!d) return false;
  var t = d.getTime();
  return (periods || []).some(function (p) {
    var s = startMs(p), e = endMs(p);
    return s != null && e != null && t >= s && t <= e;
  });
}

// Does a range [start, end] overlap any away window? (Either bound omitted →
// treated as a single point at the other bound.)
export function overlapsAway(start, end, periods) {
  var s = start ? toLocalDate(start) : null;
  var e = end ? toLocalDate(end) : null;
  var sa = s ? s.getTime() : (e ? e.getTime() : null);
  var ea = e ? new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999).getTime() : sa;
  if (sa == null) return false;
  return (periods || []).some(function (p) {
    var ps = startMs(p), pe = endMs(p);
    return ps != null && pe != null && sa <= pe && ea >= ps;
  });
}

// The away period covering `now` (currently on vacation), or null.
export function currentlyAway(periods, now) {
  var t = (now ? new Date(now) : new Date()).getTime();
  return (periods || []).find(function (p) {
    var s = startMs(p), e = endMs(p);
    return s != null && e != null && t >= s && t <= e;
  }) || null;
}

// The most recently-ended away period if it ended within `withinDays` of now
// (i.e. the user is freshly back) — used to tag return-from-vacation items and
// lead the first-day-back read. Null if not just back.
export function justBackFrom(periods, now, withinDays) {
  var n = (now ? new Date(now) : new Date()).getTime();
  var window = (withinDays == null ? 3 : withinDays) * DAY_MS;
  var best = null;
  (periods || []).forEach(function (p) {
    var e = endMs(p);
    if (e == null) return;
    if (e <= n && (n - e) <= window) {
      if (!best || e > endMs(best)) best = p;
    }
  });
  return best;
}

// Short human label for an away period, e.g. "Jun 16–20". Deterministic (no
// toLocaleDateString — check-guards Guard 2).
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function awayLabel(p) {
  var s = toLocalDate(p.start_date), e = toLocalDate(p.end_date);
  if (!s || !e) return "";
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return MON[s.getMonth()] + " " + s.getDate() + "–" + e.getDate();
  }
  return MON[s.getMonth()] + " " + s.getDate() + " – " + MON[e.getMonth()] + " " + e.getDate();
}
