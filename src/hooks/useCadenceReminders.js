import { useState, useEffect, useRef, useCallback } from "react";
import { getNextOccurrence, getFrequencyLabel } from "../lib/cadenceUtils";

// Three reminder thresholds, in minutes before the meeting starts.
// "start" fires at the exact meeting time (0 min before).
var THRESHOLDS = [
  { key: "30m",   minutes: 30 },
  { key: "5m",    minutes: 5  },
  { key: "start", minutes: 0  },
];

var TICK_MS         = 30 * 1000;
var STALE_AFTER_MS  = 6 * 60 * 60 * 1000;  // drop banners 6h past start
var FIRED_KEY       = "folio_cadence_reminders_fired";
var DISMISSED_KEY   = "folio_cadence_reminders_dismissed";
var ENABLED_KEY     = "folio_meeting_notifications";  // "granted" | "denied" | "asked"
var BANNERS_KEY     = "folio_meeting_banners_enabled"; // "1" (default) | "0"
var PROMPTED_KEY    = "folio_meeting_notif_prompted";

function safeGetJSON(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function safeSetJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

function permState() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

function bannersEnabled() {
  try {
    var v = localStorage.getItem(BANNERS_KEY);
    return v !== "0";
  } catch (e) { return true; }
}

// Compute next occurrence Date with meeting_time applied. Returns null if
// the cadence has no meeting_time, or if the next occurrence is in the past.
function nextStartFor(cadence, now) {
  if (!cadence || !cadence.meeting_time) return null;
  var parts = String(cadence.meeting_time).split(":");
  var hh = parseInt(parts[0], 10);
  var mm = parseInt(parts[1] || "0", 10);
  if (isNaN(hh) || isNaN(mm)) return null;

  // Try today first
  var today = new Date(now);
  today.setHours(0, 0, 0, 0);
  var occ = getNextOccurrence(cadence, today);
  if (!occ) return null;
  var start = new Date(occ);
  start.setHours(hh, mm, 0, 0);

  // If today's occurrence start time has already passed, look at the next
  // occurrence after today.
  if (start.getTime() <= now.getTime() - STALE_AFTER_MS) {
    // Way past — skip ahead by one cycle
    var nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);
    var nextOcc = getNextOccurrence(cadence, nextDay);
    if (!nextOcc) return null;
    start = new Date(nextOcc);
    start.setHours(hh, mm, 0, 0);
  }
  return start;
}

function occurrenceKey(d) {
  // YYYY-MM-DD in local time
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function makeReminderId(cadenceId, threshold, occDate) {
  return cadenceId + ":" + threshold + ":" + occurrenceKey(occDate);
}

function pipCopyFor(threshold, cadenceLabel, accountName) {
  if (threshold === "30m") {
    return cadenceLabel + " with " + accountName + " starts in 30 min.";
  }
  if (threshold === "5m") {
    return cadenceLabel + " with " + accountName + " starts in 5 min — want to open the hub?";
  }
  return cadenceLabel + " with " + accountName + " just started. Jump in?";
}

function systemNotificationBody(threshold, cadenceLabel, accountName) {
  if (threshold === "30m") return cadenceLabel + " with " + accountName + " in 30 minutes.";
  if (threshold === "5m")  return cadenceLabel + " with " + accountName + " in 5 minutes.";
  return cadenceLabel + " with " + accountName + " just started.";
}

export function useCadenceReminders(userId, cadences, accounts, scheduledMeetings) {
  var [reminders, setReminders]   = useState([]);
  var [permission, setPermission] = useState(permState());
  var firedRef     = useRef(null);
  var dismissedRef = useRef(null);

  if (firedRef.current === null) {
    firedRef.current = safeGetJSON(FIRED_KEY) || {};
  }
  if (dismissedRef.current === null) {
    dismissedRef.current = safeGetJSON(DISMISSED_KEY) || {};
  }

  function persistFired()     { safeSetJSON(FIRED_KEY, firedRef.current); }
  function persistDismissed() { safeSetJSON(DISMISSED_KEY, dismissedRef.current); }

  function pruneOldEntries(map, now, maxAgeMs) {
    var changed = false;
    Object.keys(map).forEach(function (k) {
      var at = map[k];
      if (typeof at !== "number") { delete map[k]; changed = true; return; }
      if (now - at > maxAgeMs) { delete map[k]; changed = true; }
    });
    return changed;
  }

  var requestPermission = useCallback(function () {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    try { localStorage.setItem(PROMPTED_KEY, "1"); } catch (e) {}
    if (Notification.permission !== "default") {
      try { localStorage.setItem(ENABLED_KEY, Notification.permission); } catch (e) {}
      setPermission(Notification.permission);
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission().then(function (p) {
      try { localStorage.setItem(ENABLED_KEY, p); } catch (e) {}
      setPermission(p);
      return p;
    });
  }, []);

  function dismissReminder(id) {
    dismissedRef.current[id] = Date.now();
    persistDismissed();
    setReminders(function (prev) { return prev.filter(function (r) { return r.id !== id; }); });
  }

  // Tick — scan cadences for crossed thresholds.
  useEffect(function () {
    if (!userId) return;
    var hasCadences   = cadences && cadences.length > 0;
    var hasScheduled  = scheduledMeetings && scheduledMeetings.length > 0;
    if (!hasCadences && !hasScheduled) {
      setReminders([]);
      return;
    }

    var cancelled = false;
    var accountById = {};
    (accounts || []).forEach(function (a) { accountById[a.id] = a; });

    function tick() {
      if (cancelled) return;
      var now = Date.now();
      var maxAgeMs = 36 * 60 * 60 * 1000;
      if (pruneOldEntries(firedRef.current, now, maxAgeMs)) persistFired();
      if (pruneOldEntries(dismissedRef.current, now, maxAgeMs)) persistDismissed();

      var newlyFired = [];
      var active = []; // reminders that should currently be visible

      (cadences || []).forEach(function (c) {
        if (!c || !c.meeting_time) return;
        var acct = accountById[c.account_id];
        if (!acct) return;
        if (acct.is_inactive) return;

        var start = nextStartFor(c, new Date(now));
        if (!start) return;
        var startMs = start.getTime();

        THRESHOLDS.forEach(function (t) {
          var fireAt = startMs - t.minutes * 60 * 1000;
          var id = makeReminderId(c.id, t.key, start);

          if (now >= fireAt && now <= startMs + STALE_AFTER_MS) {
            var alreadyFired     = !!firedRef.current[id];
            var alreadyDismissed = !!dismissedRef.current[id];
            var label = getFrequencyLabel(c) || "Cadence";
            var name  = acct.name || "this account";
            var reminder = {
              id:            id,
              cadenceId:     c.id,
              accountId:     c.account_id,
              accountName:   name,
              cadenceLabel:  label,
              threshold:     t.key,
              startAt:       startMs,
              firedAt:       alreadyFired ? firedRef.current[id] : now,
              text:          pipCopyFor(t.key, label, name),
            };
            if (!alreadyDismissed) active.push(reminder);
            if (!alreadyFired) {
              firedRef.current[id] = now;
              if (!alreadyDismissed) newlyFired.push(reminder);
            }
          }
        });
      });

      // Process scheduled one-off meetings.
      (scheduledMeetings || []).forEach(function (m) {
        if (!m || !m.meeting_date || !m.meeting_time) return;
        var acct = accountById[m.account_id];
        var name = acct ? (acct.name || "this account") : "this account";

        // Parse fixed start datetime from meeting_date + meeting_time
        var parts = String(m.meeting_time).split(":");
        var hh = parseInt(parts[0], 10);
        var mm = parseInt(parts[1] || "0", 10);
        if (isNaN(hh) || isNaN(mm)) return;
        var startDate = new Date(m.meeting_date + "T00:00:00");
        startDate.setHours(hh, mm, 0, 0);
        var startMs = startDate.getTime();

        // Skip meetings in the past beyond STALE_AFTER_MS
        if (now > startMs + STALE_AFTER_MS) return;

        THRESHOLDS.forEach(function (t) {
          var fireAt = startMs - t.minutes * 60 * 1000;
          var id = "sched:" + m.id + ":" + t.key;

          if (now >= fireAt && now <= startMs + STALE_AFTER_MS) {
            var alreadyFired     = !!firedRef.current[id];
            var alreadyDismissed = !!dismissedRef.current[id];
            var label = "Meeting";
            var reminder = {
              id:            id,
              cadenceId:     null,
              scheduledMeetingId: m.id,
              accountId:     m.account_id,
              accountName:   name,
              cadenceLabel:  label,
              threshold:     t.key,
              startAt:       startMs,
              firedAt:       alreadyFired ? firedRef.current[id] : now,
              text:          pipCopyFor(t.key, label, name),
            };
            if (!alreadyDismissed) active.push(reminder);
            if (!alreadyFired) {
              firedRef.current[id] = now;
              if (!alreadyDismissed) newlyFired.push(reminder);
            }
          }
        });
      });

      if (newlyFired.length) persistFired();

      // Fire system notifications for newly-fired reminders if permission
      // granted. Wrapped in try so a flaky Notification API never blows up
      // the tick loop.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        newlyFired.forEach(function (r) {
          try {
            var n = new Notification("Pip · " + r.accountName, {
              body: systemNotificationBody(r.threshold, r.cadenceLabel, r.accountName),
              tag:  r.id,
              icon: "/folio-icon-192.png",
            });
            n.onclick = function () {
              try { window.focus(); } catch (e) {}
              n.close();
            };
          } catch (e) {
            // Notification API may throw in some environments — degrade silently.
          }
        });
      }

      // Replace state only when the visible set changes (by id).
      setReminders(function (prev) {
        if (prev.length === active.length) {
          var same = true;
          for (var i = 0; i < prev.length; i++) {
            if (prev[i].id !== active[i].id) { same = false; break; }
          }
          if (same) return prev;
        }
        // Sort: start tone first (most urgent), then 5m, then 30m
        var order = { start: 0, "5m": 1, "30m": 2 };
        return active.slice().sort(function (a, b) {
          return (order[a.threshold] - order[b.threshold]) || (a.startAt - b.startAt);
        });
      });
    }

    tick();
    var iv = setInterval(tick, TICK_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return function () {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cadences, accounts, scheduledMeetings]);

  return {
    reminders:         bannersEnabled() ? reminders : [],
    rawReminders:      reminders,
    dismissReminder:   dismissReminder,
    permissionState:   permission,
    requestPermission: requestPermission,
  };
}
