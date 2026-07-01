// Conference Prep (item 56) — pre-departure readiness before a conference:
// closing loose ends across the portfolio + tracking presentation prep, so
// nothing is dropped when the user goes dark for the trip. NOT an in-event
// tool (that's Lanyard's lane, deliberately untouched here).
//
// Pure, deterministic, no network — surfaces feed this the data they already
// loaded (allItems/allProjects/accounts). DATA LINE: titles/names only, same
// rule as every other Pip-adjacent surface.

import { toLocalDate, todayISO } from "./dateUtils.js";

var DAY_MS = 24 * 60 * 60 * 1000;

// Whole-day difference between a conference's start_date and today (local).
// Negative = already started/past; 0 = today; positive = days remaining.
export function daysUntil(conference, today) {
  if (!conference || !conference.start_date) return null;
  var s = toLocalDate(conference.start_date);
  var t = toLocalDate(today || todayISO());
  if (!s || !t) return null;
  var sMid = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  var tMid = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((sMid - tMid) / DAY_MS);
}

// "upcoming" | "active" | "past" — active covers the inclusive event window.
export function conferenceStatus(conference, today) {
  if (!conference || !conference.start_date || !conference.end_date) return "upcoming";
  var t = toLocalDate(today || todayISO());
  var s = toLocalDate(conference.start_date);
  var e = toLocalDate(conference.end_date);
  if (!t || !s || !e) return "upcoming";
  var tMid = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  var sMid = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  var eMid = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
  if (tMid < sMid) return "upcoming";
  if (tMid > eMid) return "past";
  return "active";
}

// Should the pre-departure surface show on Home? Within `windowDays` of
// departure and not yet started. Default window: 21 days.
export function isPrepWindow(conference, today, windowDays) {
  var d = daysUntil(conference, today);
  if (d == null) return false;
  var w = windowDays == null ? 21 : windowDays;
  return d >= 0 && d <= w;
}

// The nearest upcoming (or currently active) conference from a list — the one
// the Home card and prep sweep should focus on. Null if none.
export function nextConference(conferences, today) {
  var upcoming = (conferences || []).filter(function (c) {
    var st = conferenceStatus(c, today);
    return st === "upcoming" || st === "active";
  });
  upcoming.sort(function (a, b) {
    return (a.start_date || "").localeCompare(b.start_date || "");
  });
  return upcoming[0] || null;
}

function rowFromItem(i, accountName) {
  return {
    kind: "task",
    id: i.id,
    title: i.text || i.title || "—",
    account_id: i.account_id || null,
    account_name: accountName || null,
    due_date: i.due_date || null,
    is_commitment: !!i.is_commitment,
    waiting_on: i.waiting_on || null,
  };
}

function rowFromProject(p, accountName) {
  return {
    kind: "project",
    id: p.id,
    title: p.title || "untitled project",
    account_id: p.account_id || null,
    account_name: accountName || null,
    due_date: p.due_date || null,
    is_commitment: false,
    waiting_on: p.waiting_on || null,
  };
}

// The "close loose ends before you fly out" sweep — open commitments/overdue
// tasks + stalled projects, grouped so accounts you'll actually see at the
// conference are called out first. Returns { conferenceRows, portfolioRows }.
export function buildLooseEndsSweep(input) {
  var conference = input.conference;
  var items      = input.items || [];
  var projects   = input.projects || [];
  var accounts   = input.accounts || [];

  var accountName = {};
  accounts.forEach(function (a) { accountName[a.id] = a.name || ""; });

  var confAccountIds = {};
  (conference && conference.account_ids || []).forEach(function (id) { confAccountIds[id] = true; });

  var openItems = items.filter(function (i) { return !i.done && i.status !== "complete"; });
  var openProjects = projects.filter(function (p) { return p.status !== "complete" && p.status !== "draft"; });

  var rows = [];
  openItems.forEach(function (i) {
    if (!i.due_date && !i.is_commitment) return; // undated non-commitments are noise here
    rows.push(rowFromItem(i, accountName[i.account_id]));
  });
  openProjects.forEach(function (p) {
    if (!p.waiting_on && !p.due_date) return; // only surface projects with a live loose end
    rows.push(rowFromProject(p, accountName[p.account_id]));
  });

  rows.sort(function (a, b) { return (a.due_date || "9999").localeCompare(b.due_date || "9999"); });

  var conferenceRows = rows.filter(function (r) { return r.account_id && confAccountIds[r.account_id]; });
  var portfolioRows  = rows.filter(function (r) { return !(r.account_id && confAccountIds[r.account_id]); });

  return { conferenceRows: conferenceRows, portfolioRows: portfolioRows };
}

// Checklist completion for the linked presentation-prep Gauge project.
export function presentationProgress(project) {
  if (!project || !Array.isArray(project.tasks) || !project.tasks.length) {
    return { total: 0, done: 0, pct: null };
  }
  var total = project.tasks.length;
  var done = project.tasks.filter(function (t) { return t.done; }).length;
  return { total: total, done: done, pct: Math.round((done / total) * 100) };
}

// Default presentation-prep checklist, seeded when a conference is created
// with "track presentation prep" checked. Kept short and generic.
export var PRESENTATION_CHECKLIST = [
  "Outline the talking points",
  "Draft the slides",
  "Rehearse",
  "Pack materials / handouts",
];
