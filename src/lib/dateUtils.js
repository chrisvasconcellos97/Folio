// Shared date layer — one ET-safe implementation so the app stops drifting
// across ~14 hand-rolled date formatters, ~7 isOverdue copies, and ~5
// relative-time variants (App Coherence Rule). Batch 9 Guard 2 fails any new
// `toLocaleDateString(` outside this file once it lands.
//
// ET-SAFETY: a bare "YYYY-MM-DD" string parsed by `new Date(str)` is treated
// as UTC midnight, which renders a day early for anyone west of GMT (Chris is
// in ET). So every formatter here normalizes a date-only string to LOCAL
// midnight by appending "T00:00:00" before parsing. ISO timestamps (with a
// time component) and Date objects pass through untouched.

// Normalize any accepted input to a Date in local time.
//   - Date object → returned as-is
//   - "YYYY-MM-DD" (date-only) → local midnight (append T00:00:00)
//   - full ISO / other string → native parse
//   - number (ms epoch) → Date
// Returns null for empty/invalid input so callers can guard.
export function toLocalDate(input) {
  if (input == null || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") {
    var dn = new Date(input);
    return isNaN(dn.getTime()) ? null : dn;
  }
  var s = String(input);
  // Date-only "YYYY-MM-DD" → anchor to local midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + "T00:00:00";
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// "Jun 4" — month + day, no year. The app's most common short date.
export function fmtShort(input) {
  var d = toLocalDate(input);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "Jun 4, 2026" — month + day + year, abbreviated month. The most common
// "with year" format across the app (meeting cards, closed dates, etc).
export function fmtMedium(input) {
  var d = toLocalDate(input);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "June 4, 2026" — full month name + day + year.
export function fmtLong(input) {
  var d = toLocalDate(input);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// "2h ago" / "3d ago" / "just now" — coarse relative time for timestamps.
// Falls back to fmtShort once a week out so old items read as a real date.
export function fmtRelative(input) {
  var d = toLocalDate(input);
  if (!d) return "";
  var diff = Date.now() - d.getTime();
  if (diff < 0) diff = 0;
  if (diff < 60000) return "just now";
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  var days = Math.floor(hrs / 24);
  if (days < 7) return days + "d ago";
  var wks = Math.floor(days / 7);
  if (wks < 5) return wks + "w ago";
  return fmtShort(d);
}

// Local "YYYY-MM-DD" for today — the ET-safe "today" string. Pass a Date to
// get its local date string. Avoids `toISOString().slice(0,10)` which is UTC.
export function todayISO(now) {
  var d = now instanceof Date ? now : new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// True when `input` falls before today (local). A date-only "YYYY-MM-DD"
// compares by calendar day; an ISO timestamp compares against local midnight.
// Optional `today` override (Date or "YYYY-MM-DD") for testability.
export function isOverdue(input, today) {
  var d = toLocalDate(input);
  if (!d) return false;
  var ref;
  if (today != null) {
    ref = toLocalDate(today);
  } else {
    ref = new Date();
  }
  if (!ref) return false;
  // Compare at day granularity — anything earlier than the start of `ref`'s
  // day is overdue.
  var refMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return d < refMidnight;
}

// True when `input` is the same calendar day as today (local).
export function isToday(input, today) {
  var d = toLocalDate(input);
  if (!d) return false;
  var ref = today != null ? toLocalDate(today) : new Date();
  if (!ref) return false;
  return d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();
}
