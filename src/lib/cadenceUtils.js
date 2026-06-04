export var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export var DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export var MONTHS     = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

export function formatTime(t) {
  if (!t) return '';
  var parts = t.split(':');
  var h = parseInt(parts[0]);
  var m = parts[1] || '00';
  var ampm = h >= 12 ? 'PM' : 'AM';
  var hour = h % 12 || 12;
  return hour + ':' + m + ' ' + ampm;
}

function ordinal(n) {
  var s = ['th', 'st', 'nd', 'rd'];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function getFrequencyLabel(cadence) {
  if (!cadence) return '';
  var day  = DAYS_FULL[cadence.day_of_week];
  var time = cadence.meeting_time ? ' · ' + formatTime(cadence.meeting_time) : '';
  if (cadence.frequency === 'weekly')   return 'Every ' + day + time;
  if (cadence.frequency === 'biweekly') return 'Every other ' + day + time;
  if (cadence.frequency === 'monthly') {
    if (cadence.monthly_type === 'day_of_week' && cadence.monthly_ordinal && cadence.day_of_week != null) {
      var ordLabels = { first: 'First', second: 'Second', third: 'Third', fourth: 'Fourth', last: 'Last' };
      return (ordLabels[cadence.monthly_ordinal] || '') + ' ' + DAYS_FULL[cadence.day_of_week] + time;
    }
    return 'Monthly · ' + ordinal(cadence.day_of_month) + time;
  }
  return '';
}

// Number of days in a given month (month is 0-indexed). Day 0 of the next
// month is the last day of this month.
export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Build a Date for (year, month, dayOfMonth) but CLAMP the day to the last day
// of the month so "monthly on the 31st" lands on Feb 28/29 instead of silently
// rolling forward into March (new Date(2026,1,31) → Mar 3).
function monthlyDate(year, month, dayOfMonth) {
  var d = Math.min(dayOfMonth || 1, daysInMonth(year, month));
  return new Date(year, month, d);
}

export function getNextOccurrence(cadence, fromDate) {
  var from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);

  if (cadence.frequency === 'weekly') {
    var target = cadence.day_of_week;
    var current = from.getDay();
    var daysUntilNext = (target - current + 7) % 7;
    var next = new Date(from);
    next.setDate(from.getDate() + daysUntilNext);
    return next;
  }

  if (cadence.frequency === 'biweekly') {
    var target = cadence.day_of_week;
    var refStr = cadence.anchor_date
      ? cadence.anchor_date + 'T00:00:00'
      : cadence.created_at;
    var ref = new Date(refStr);
    ref.setHours(0, 0, 0, 0);
    var current = from.getDay();
    var daysUntilNext = (target - current + 7) % 7;
    var candidate = new Date(from);
    candidate.setDate(from.getDate() + daysUntilNext);
    var msPerWeek = 7 * 24 * 60 * 60 * 1000;
    var refDay = ref.getDay();
    var refDaysToTarget = (target - refDay + 7) % 7;
    var refOccurrence = new Date(ref);
    refOccurrence.setDate(ref.getDate() + refDaysToTarget);
    var weeksDiff = Math.round((candidate - refOccurrence) / msPerWeek);
    if (weeksDiff % 2 !== 0) candidate.setDate(candidate.getDate() + 7);
    return candidate;
  }

  if (cadence.frequency === 'monthly') {
    if (cadence.monthly_type === 'day_of_week' && cadence.monthly_ordinal && cadence.day_of_week != null) {
      var y = from.getFullYear(), mo = from.getMonth();
      var day = getNthWeekdayOfMonth(y, mo, cadence.day_of_week, cadence.monthly_ordinal);
      var next = day ? new Date(y, mo, day) : null;
      if (!next || next < from) {
        mo++; if (mo > 11) { mo = 0; y++; }
        day = getNthWeekdayOfMonth(y, mo, cadence.day_of_week, cadence.monthly_ordinal);
        next = day ? new Date(y, mo, day) : null;
      }
      return next;
    }
    var next = monthlyDate(from.getFullYear(), from.getMonth(), cadence.day_of_month);
    if (next < from) {
      var nmo = from.getMonth() + 1, nyr = from.getFullYear();
      if (nmo > 11) { nmo = 0; nyr++; }
      next = monthlyDate(nyr, nmo, cadence.day_of_month);
    }
    return next;
  }

  return null;
}

export function getOccurrencesInRange(cadence, startDate, endDate) {
  var occurrences = [];
  var start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  var end = new Date(endDate);
  end.setHours(23, 59, 59);

  var current = getNextOccurrence(cadence, start);
  if (!current) return occurrences;

  while (current <= end) {
    occurrences.push(new Date(current));
    if (cadence.frequency === 'weekly')        current.setDate(current.getDate() + 7);
    else if (cadence.frequency === 'biweekly') current.setDate(current.getDate() + 14);
    else if (cadence.frequency === 'monthly') {
      var ny = current.getFullYear(), nm = current.getMonth() + 1;
      if (nm > 11) { nm = 0; ny++; }
      if (cadence.monthly_type === 'day_of_week' && cadence.monthly_ordinal) {
        var nd = getNthWeekdayOfMonth(ny, nm, cadence.day_of_week, cadence.monthly_ordinal);
        current = nd ? new Date(ny, nm, nd) : null;
        if (!current) break;
      } else {
        current = monthlyDate(ny, nm, cadence.day_of_month);
      }
    } else break;
  }

  return occurrences;
}

export function daysUntil(date) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  var diff = Math.round((d - today) / (24 * 60 * 60 * 1000));
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0)   return Math.abs(diff) + ' days ago';
  if (diff < 7)   return 'In ' + diff + ' days';
  if (diff < 14)  return 'Next week';
  return 'In ' + Math.ceil(diff / 7) + ' weeks';
}

export function formatDateFull(date) {
  var d = new Date(date);
  return DAYS_FULL[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

export function startOfWeek(date) {
  var d = new Date(date);
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getCalendarGrid(year, month) {
  var firstDay = new Date(year, month, 1);
  var startDow = firstDay.getDay();
  var grid = [];
  for (var i = 0; i < 42; i++) {
    grid.push(new Date(year, month, 1 - startDow + i));
  }
  return grid;
}

export function getNthWeekdayOfMonth(year, month, dayOfWeek, ordinal) {
  var firstDay = new Date(year, month, 1);
  var firstDow = firstDay.getDay();
  var daysUntilTarget = (dayOfWeek - firstDow + 7) % 7;
  var firstOccurrence = 1 + daysUntilTarget;
  if (ordinal === 'last') {
    var lastDay = new Date(year, month + 1, 0).getDate();
    var lastDow = new Date(year, month, lastDay).getDay();
    var daysBack = (lastDow - dayOfWeek + 7) % 7;
    return lastDay - daysBack;
  }
  var ordinals = { first: 1, second: 2, third: 3, fourth: 4 };
  var n = ordinals[ordinal] || 1;
  var day = firstOccurrence + (n - 1) * 7;
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  return day <= daysInMonth ? day : null;
}
