// Week-in-review engine — the shared retrospective brain behind the Win Log
// (#3) and the Friday Pip Wrap (#4). Pure functions only (no supabase/React/
// fetch) so every surface feeds it the data it already has in memory.
//
// One engine, two faces: #3 reads commitmentStats + candidateWins for the
// persistent track-record surface; #4 reads weeklyMovement for the Friday card.
// Building the stats once here (not per-surface) is the App Coherence Rule.
//
// DATA LINE: everything here is about CHRIS'S OWN work (promises kept, projects
// moved, accounts touched) — never OEC quantitative business data. No counts of
// shops/customers/revenue ever enter these computations.

import { toLocalDate } from "./dateUtils.js";

var DAY_MS = 24 * 60 * 60 * 1000;

function endOfDayMs(localDate) {
  // The last instant of a due date's local day — a commitment closed any time
  // that day still counts as "on time."
  return new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 23, 59, 59, 999).getTime();
}

// Monday 00:00 local of the week containing `now` — the start of "this week."
export function weekStart(now) {
  var d = now ? new Date(now) : new Date();
  var day = d.getDay();                 // 0 Sun … 6 Sat
  var sinceMonday = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

// Commitment integrity across a set of folio_tasks. "Kept" = a commitment that
// closed on or before its due date (or had no due date and got done). "Slipped"
// = closed late, or still open past due. Open-on-track is everything else.
export function commitmentStats(tasks, opts) {
  opts = opts || {};
  var now = opts.now ? new Date(opts.now) : new Date();
  var kept = 0, slipped = 0, open = 0;
  (tasks || []).forEach(function (t) {
    if (!t || !t.is_commitment) return;
    var due = t.due_date ? toLocalDate(t.due_date) : null;
    if (t.done) {
      var closed = t.closed_at ? new Date(t.closed_at).getTime() : null;
      if (due && closed && closed > endOfDayMs(due)) slipped++;
      else kept++;
    } else if (due && now.getTime() > endOfDayMs(due)) {
      slipped++;
    } else {
      open++;
    }
  });
  var resolved = kept + slipped;
  return {
    kept: kept,
    slipped: slipped,
    open: open,
    resolved: resolved,
    rate: resolved ? kept / resolved : null, // null when nothing has resolved yet
  };
}

function inWindow(ts, startMs, endMs) {
  if (!ts) return false;
  var t = new Date(ts).getTime();
  return t >= startMs && t <= endMs;
}

// A project "moved" this week if it got a status pulse, was edited, or had a
// task complete inside the window.
function projectMovedInWindow(p, startMs, endMs) {
  if (inWindow(p.updated_at, startMs, endMs)) return true;
  var ups = p.status_updates;
  if (ups && ups.length && ups.some(function (u) { return inWindow(u && u.at, startMs, endMs); })) return true;
  var tasks = p.tasks || [];
  return tasks.some(function (t) { return t && t.completed_at && inWindow(t.completed_at, startMs, endMs); });
}

// The whole Friday read in one object. `ownedAccountId(account)` lets the caller
// inject ownership (so neglected only flags accounts that are actually Chris's).
export function weeklyMovement(ctx) {
  ctx = ctx || {};
  var now = ctx.now ? new Date(ctx.now) : new Date();
  var startMs = (ctx.weekStart ? new Date(ctx.weekStart) : weekStart(now)).getTime();
  var endMs = now.getTime();
  var accounts = ctx.accounts || [];
  var meetings = ctx.meetings || [];
  var projects = ctx.projects || [];
  var tasks = ctx.tasks || [];
  var wins = ctx.wins || [];
  var isMine = ctx.isMine || function () { return true; };

  var byId = {};
  accounts.forEach(function (a) { byId[a.id] = a; });

  // Accounts touched: a logged (non-scheduled) meeting in the window.
  var touched = {};
  meetings.forEach(function (m) {
    if (m.status === "scheduled" || m.status === "draft") return;
    if (!inWindow(m.meeting_date, startMs, endMs) && !inWindow(m.created_at, startMs, endMs)) return;
    var ids = (m.account_ids && m.account_ids.length) ? m.account_ids : (m.account_id ? [m.account_id] : []);
    ids.forEach(function (id) { if (id) touched[id] = true; });
  });
  var touchedList = Object.keys(touched)
    .map(function (id) { return byId[id]; })
    .filter(Boolean)
    .map(function (a) { return { id: a.id, name: a.name }; });

  // Neglected: owned, active accounts gone cold (no contact in 14+ days),
  // surfaced as the short list worth a nudge. Newest-cold sorts last.
  var COLD_MS = 14 * DAY_MS;
  var neglected = accounts
    .filter(function (a) {
      if (a.is_inactive) return false;
      if (!isMine(a)) return false;
      if (touched[a.id]) return false;
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      return (now.getTime() - last) >= COLD_MS;
    })
    .map(function (a) {
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      return { id: a.id, name: a.name, days: last ? Math.floor((now.getTime() - last) / DAY_MS) : null };
    })
    .sort(function (x, y) { return (y.days || 9999) - (x.days || 9999); })
    .slice(0, 6);

  var moved = projects
    .filter(function (p) { return projectMovedInWindow(p, startMs, endMs); })
    .map(function (p) {
      var a = p.account_id ? byId[p.account_id] : null;
      return { id: p.id, title: p.title, accountName: a ? a.name : null, status: p.status };
    });

  // Commitments resolved this week (closed inside the window).
  var keptThisWeek = 0, slippedThisWeek = 0;
  (tasks || []).forEach(function (t) {
    if (!t || !t.is_commitment || !t.done || !t.closed_at) return;
    if (!inWindow(t.closed_at, startMs, endMs)) return;
    var due = t.due_date ? toLocalDate(t.due_date) : null;
    var closed = new Date(t.closed_at).getTime();
    if (due && closed > endOfDayMs(due)) slippedThisWeek++;
    else keptThisWeek++;
  });

  var winsThisWeek = (wins || []).filter(function (w) {
    return inWindow(w.occurred_on || w.created_at, startMs, endMs);
  });

  return {
    weekStart: new Date(startMs),
    touched: touchedList,
    neglected: neglected,
    moved: moved,
    commitmentsKept: keptThisWeek,
    commitmentsSlipped: slippedThisWeek,
    wins: winsThisWeek,
    isQuiet: touchedList.length === 0 && moved.length === 0 && keptThisWeek === 0 && winsThisWeek.length === 0,
  };
}

// Auto-detected wins worth a one-tap "log it" — projects completed this week +
// commitments kept on time this week. The caller dedupes against already-logged
// wins (by source + ref id). Returns lightweight {kind, title, accountId, ref}.
export function candidateWins(ctx) {
  ctx = ctx || {};
  var now = ctx.now ? new Date(ctx.now) : new Date();
  var startMs = (ctx.weekStart ? new Date(ctx.weekStart) : weekStart(now)).getTime();
  var endMs = now.getTime();
  var byId = {};
  (ctx.accounts || []).forEach(function (a) { byId[a.id] = a; });
  var out = [];

  (ctx.projects || []).forEach(function (p) {
    if (p.status !== "complete") return;
    if (!inWindow(p.updated_at, startMs, endMs)) return;
    var a = p.account_id ? byId[p.account_id] : null;
    out.push({ kind: "project", title: p.title, accountId: p.account_id || null, accountName: a ? a.name : null, ref: "project:" + p.id });
  });

  (ctx.tasks || []).forEach(function (t) {
    if (!t || !t.is_commitment || !t.done || !t.closed_at) return;
    if (!inWindow(t.closed_at, startMs, endMs)) return;
    var due = t.due_date ? toLocalDate(t.due_date) : null;
    if (due && new Date(t.closed_at).getTime() > endOfDayMs(due)) return; // late = not a clean win
    var a = t.account_id ? byId[t.account_id] : null;
    out.push({ kind: "commitment", title: t.text || t.title || "Commitment kept", accountId: t.account_id || null, accountName: a ? a.name : null, ref: "task:" + t.id });
  });

  return out;
}

// Friday is the wrap day. Returns true all day Friday.
export function isFridayWrapWindow(now) {
  var d = now ? new Date(now) : new Date();
  return d.getDay() === 5;
}
