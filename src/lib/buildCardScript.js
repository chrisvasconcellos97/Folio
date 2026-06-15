// Build per-card Pip-voiced script text from real Home data.
// Pure function — zero AI cost, deterministic, called from HomeView useMemo.

export function buildCardScript({ wordCommitments, wordWaitingOn, todayItems, fireItems, activeProjects, winItems, upcomingCadences }) {
  var owe   = wordCommitments || [];
  var owing = wordWaitingOn   || [];

  // ── Card 0 — Your Word ─────────────────────────────────────────────────
  var oweParts = [];
  if (owe.length > 0) {
    var overdue   = owe.filter(function (n) { return n.isOverdue; });
    var dueToday  = owe.filter(function (n) { return !n.isOverdue && n.daysUntilDue === 0; });
    var upcoming  = owe.filter(function (n) { return !n.isOverdue && n.daysUntilDue > 0; });

    if (overdue.length === 1) {
      oweParts.push(overdue[0].title + " is " + Math.abs(overdue[0].daysUntilDue) + " day" + (Math.abs(overdue[0].daysUntilDue) !== 1 ? "s" : "") + " overdue — that one needs to move.");
    } else if (overdue.length > 1) {
      oweParts.push(overdue.length + " commitments are overdue. Worst: " + overdue[0].title + ".");
    }
    if (dueToday.length > 0) {
      var todayNames = dueToday.map(function (n) { return n.title; });
      oweParts.push(todayNames.slice(0, 2).join(" and ") + (dueToday.length === 1 ? " is" : " are") + " due today.");
    }
    if (upcoming.length > 0 && overdue.length === 0 && dueToday.length === 0) {
      oweParts.push("You've got " + upcoming.length + " promise" + (upcoming.length > 1 ? "s" : "") + " coming up. Closest: " + upcoming[0].title + " in " + upcoming[0].daysUntilDue + "d.");
    }
  }
  if (owing.length > 0) {
    var old = owing[0];
    if (owing.length === 1) {
      oweParts.push("One thing stuck on their side — " + old.who + " on " + old.what + (old.days ? ", held " + old.days + "d" : "") + ".");
    } else {
      oweParts.push(owing.length + " things waiting on others. Longest: " + old.who + " on " + old.what + (old.days ? " (" + old.days + "d)" : "") + ".");
    }
  }
  var wordScript = oweParts.length > 0
    ? oweParts.join(" ")
    : "Board's clear. Nothing owed, nothing waiting on anyone. Good position.";

  // ── Card 1 — Today ─────────────────────────────────────────────────────
  var today = todayItems || [];
  var todayParts = [];
  if (today.length === 0) {
    todayParts.push("Nothing on the calendar. Free day — use it.");
  } else {
    var withTime = today.filter(function (it) { return it.time; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
    var noTime   = today.filter(function (it) { return !it.time; });
    if (withTime.length === 1) {
      todayParts.push("One call today — " + withTime[0].label + " at " + withTime[0].time + ".");
    } else if (withTime.length > 1) {
      todayParts.push(withTime.length + " calls today. First up: " + withTime[0].label + " at " + withTime[0].time + ".");
    }
    if (noTime.length > 0) {
      todayParts.push(noTime.length + " more scheduled (time not set).");
    }
  }
  var todayScript = todayParts.join(" ") || "Calendar's open.";

  // ── Card 2 — Fires ─────────────────────────────────────────────────────
  var fires = fireItems || [];
  var fireParts = [];
  if (fires.length === 0) {
    fireParts.push("No fires right now. Clean board.");
  } else {
    var first = fires[0];
    var firstName = first.account_name || first.left || "an account";
    fireParts.push((fires.length === 1 ? "One account needs eyes: " : fires.length + " things to watch. Worst: ") + firstName + ".");
    if (first.line || first.sub) fireParts.push(first.line || first.sub);
    if (fires.length > 1) fireParts.push((fires.length - 1) + " more behind it.");
  }
  var firesScript = fireParts.join(" ");

  // ── Card 3 — In Flight ─────────────────────────────────────────────────
  var projects = activeProjects || [];
  var projParts = [];
  if (projects.length === 0) {
    projParts.push("Nothing active in Gauge right now.");
  } else {
    var stuck   = projects.filter(function (p) { return p.is_stuck; });
    var waiting = projects.filter(function (p) { return p.waiting_on; });
    projParts.push(projects.length + " project" + (projects.length > 1 ? "s" : "") + " in flight.");
    if (stuck.length > 0) {
      projParts.push(stuck.length === 1 ? stuck[0].title + " has gone quiet — worth a check." : stuck.length + " haven't moved in a while.");
    }
    if (waiting.length > 0) {
      projParts.push((waiting[0].title || "One project") + " is waiting on " + waiting[0].waiting_on + ".");
    }
  }
  var inFlightScript = projParts.join(" ");

  // ── Card 4 — Good News ─────────────────────────────────────────────────
  var wins = winItems || [];
  var winParts = [];
  if (wins.length === 0) {
    winParts.push("Nothing specific to flag this week. Keep moving.");
  } else {
    wins.slice(0, 3).forEach(function (w) {
      winParts.push((w.account_name || w.left || "Something") + " — " + (w.line || w.sub || "a win this week") + ".");
    });
  }
  var goodNewsScript = winParts.join(" ");

  // ── Card 5 — This Week ─────────────────────────────────────────────────
  var upcoming = upcomingCadences || [];
  var weekParts = [];
  if (upcoming.length === 0) {
    weekParts.push("Nothing on the cadence calendar this week. Good time to reach out to anyone who's gone quiet.");
  } else if (upcoming.length === 1) {
    weekParts.push(upcoming.length + " cadence this week — " + upcoming[0].label + (upcoming[0].daysOut === 1 ? " tomorrow" : " in " + upcoming[0].daysOut + " days") + ".");
  } else {
    weekParts.push(upcoming.length + " cadences coming up. First: " + upcoming[0].label + (upcoming[0].daysOut === 1 ? " tomorrow" : " in " + upcoming[0].daysOut + " days") + ".");
    weekParts.push("Then " + upcoming[1].label + " in " + upcoming[1].daysOut + "d.");
  }
  var thisWeekScript = weekParts.join(" ");

  return [
    { label: "Your Word",  text: wordScript     },
    { label: "Today",      text: todayScript     },
    { label: "Fires",      text: firesScript     },
    { label: "In Flight",  text: inFlightScript  },
    { label: "Good News",  text: goodNewsScript  },
    { label: "This Week",  text: thisWeekScript  },
  ];
}
