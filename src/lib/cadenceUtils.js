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
  if (cadence.frequency === 'monthly')  return 'Monthly · ' + ordinal(cadence.day_of_month) + time;
  return '';
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
    var ref = new Date(cadence.created_at);
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
    var target = cadence.day_of_month;
    var next = new Date(from.getFullYear(), from.getMonth(), target);
    if (next < from) next = new Date(from.getFullYear(), from.getMonth() + 1, target);
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
      current = new Date(current.getFullYear(), current.getMonth() + 1, cadence.day_of_month);
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
