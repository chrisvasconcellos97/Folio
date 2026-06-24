// Sweep per-day localStorage keys (daily brief + check-in) from earlier days so
// they don't accumulate one-per-day-forever toward the ~5 MB quota. Today's keys
// are kept. Persistent keys like `folio_checkin_dismissed_<userId>` are never
// matched — they end in a userId (UUID), not a YYYY-MM-DD date. Best-effort:
// never throws, runs once at startup.
export function pruneDailyKeys(todayISO) {
  try {
    var prefixes = ["folio_daily_brief_", "folio_checkin_"];
    var datePat = /_(\d{4}-\d{2}-\d{2})$/; // only keys that END in a date are per-day
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      var hasPrefix = prefixes.some(function (p) { return k.indexOf(p) === 0; });
      if (!hasPrefix) continue;
      var m = k.match(datePat);
      if (m && m[1] < todayISO) toRemove.push(k);
    }
    toRemove.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (_) { /* ignore individual removal */ }
    });
  } catch (_) { /* best-effort; localStorage may be unavailable */ }
}
