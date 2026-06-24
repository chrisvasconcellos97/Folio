// mondayPack.js — the Monday 1:1 pack, deterministic core (Phase 2 #1 "SHINE").
//
// Chris runs his Monday 1:1 with his boss from Folios. This assembles a prep
// pack so he's never flat-footed (his #1 fear). Almost all of it is deterministic
// assembly over data that already exists — only the Pip "read" + the boss-ask
// extraction need a model call (api/monday-pack.js); everything here is free and
// always fresh.
//
// PURE MODULE — NO Supabase, NO React, NO fetch. The hook (useMondayPack) gathers
// the windowed data and feeds it in; this file classifies + assembles + hashes.
//
// THE PACK (see docs/monday-1on1-pack-plan.md):
//   0. Pip read           — model (not here)
//   1. YOUR WORD          — promised-vs-done: Kept / Slipped / Open  (buildPackSections)
//   2. BOSS'S OPEN ASKS   — model extraction (not here; payload from buildPackPromptPayload)
//   3. WHAT MOVED         — per-account week delta                   (buildPackSections)
//   4. WHO HAS THE BALL   — waiting-ons: you owe vs owed you         (buildPackSections)

import { getNextOccurrence } from "./cadenceUtils.js";

// ── tiny stable string hash (FNV-1a) — change-detection, not security ──
function fnv1a(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function isoDay(d) {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return ""; }
}

function normalizePerson(str) {
  if (!str) return str;
  if (String(str).indexOf("@") > 0) return String(str).split("@")[0].replace(/[._]/g, " ");
  return str;
}

function trunc(s, n) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function isDone(t) { return !!(t && (t.done || t.status === "complete")); }

// ── 1. Pick "the Monday 1:1" for the Home card ────────────────────────────
// Among person cadences, the one recurring on Monday (day_of_week === 1,
// weekly/biweekly), tie-broken by earliest meeting_time then created_at. No
// hardcoded "boss" — it's whatever Monday 1:1 Chris set up. Returns null if none.
export function pickMondayCadence(personCadences, today) {
  var list = (personCadences || []).filter(function (c) {
    return c &&
      (c.cadence_scope === "person" || !c.account_id) &&
      c.day_of_week === 1 &&
      (c.frequency === "weekly" || c.frequency === "biweekly");
  });
  if (!list.length) return null;
  list.sort(function (a, b) {
    var ta = a.meeting_time || "99:99";
    var tb = b.meeting_time || "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.created_at || "") < (b.created_at || "") ? -1 : 1;
  });
  return list[0];
}

// Should the Home card show? True Mon (or the cadence's next occurrence ≤ ~1 day
// out, so Sunday evening gets a heads-up). `today` is a Date.
export function shouldShowMondayCard(cadence, today) {
  if (!cadence) return false;
  var d = today ? new Date(today) : new Date();
  if (d.getDay() === 1) return true; // Monday
  var next = getNextOccurrence(cadence, d);
  if (!next) return false;
  var days = Math.round((next.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  return days >= 0 && days <= 1;
}

// ── 2. Deterministic sections (1, 3, 4) ───────────────────────────────────
// bundle: {
//   windowStart: "YYYY-MM-DD", today: "YYYY-MM-DD",
//   commitments: folio_tasks[] (is_commitment; open + recently-closed in window),
//   meetings: folio_meetings[] in window (account_id, title, meeting_date, status),
//   projects: gauge_projects[] (status_updates, waiting_on, status, updated_at),
//   tasks: folio_tasks[] (for deliveries + waiting_on; account_id, closed_at),
//   accountsById: { [id]: name }, userEmail
// }
export function buildPackSections(bundle) {
  bundle = bundle || {};
  var windowStart = bundle.windowStart || "0000-00-00";
  var today = bundle.today || isoDay(new Date());
  var acctName = bundle.accountsById || {};
  function nameOf(id) { return (id && acctName[id]) || null; }

  // ── 1. YOUR WORD — promised-vs-done ──
  var commitments = (bundle.commitments || []).filter(function (t) { return t && t.is_commitment; });
  var kept = [], slipped = [], open = [];
  commitments.forEach(function (t) {
    var due = isoDay(t.due_date);
    var row = {
      id: t.id,
      text: t.title || t.text || "—",
      account: nameOf(t.account_id),
      account_id: t.account_id || null,
      due: due || null,
    };
    if (isDone(t)) {
      var closed = isoDay(t.closed_at);
      if (closed && closed >= windowStart) { row.closed = closed; kept.push(row); }
      // closed before the window: not part of this week's record — drop.
    } else if (due && due < today) {
      slipped.push(row);
    } else {
      open.push(row);
    }
  });
  // slips first within each list isn't needed; lists are already separated.
  open.sort(function (a, b) { return (a.due || "9999") < (b.due || "9999") ? -1 : 1; });

  // ── 3. WHAT MOVED, BY ACCOUNT ──
  var movedByAcct = {}; // id -> { account, account_id, meetings:[], pulses:[], deliveries:[] }
  function moved(id) {
    var key = id || "_none";
    if (!movedByAcct[key]) movedByAcct[key] = { account: nameOf(id), account_id: id || null, meetings: [], pulses: [], deliveries: [] };
    return movedByAcct[key];
  }
  (bundle.meetings || []).forEach(function (m) {
    if (!m) return;
    var md = isoDay(m.meeting_date) || isoDay(m.created_at);
    if (!md || md < windowStart) return;
    if (m.status === "scheduled") return; // upcoming, not "moved"
    moved(m.account_id).meetings.push({ title: m.title || "Meeting", date: md });
  });
  (bundle.projects || []).forEach(function (p) {
    if (!p) return;
    var ups = Array.isArray(p.status_updates) ? p.status_updates : [];
    ups.forEach(function (u) {
      if (!u || !u.at) return;
      if (isoDay(u.at) < windowStart) return;
      moved(p.account_id).pulses.push({ project: p.title || "Project", body: trunc(u.body, 140), at: isoDay(u.at) });
    });
    // project completed in window = a delivery
    if (p.status === "complete" && isoDay(p.updated_at) >= windowStart) {
      moved(p.account_id).deliveries.push({ text: (p.title || "Project") + " — completed", project: true });
    }
  });
  (bundle.tasks || []).forEach(function (t) {
    if (!t || !isDone(t)) return;
    var closed = isoDay(t.closed_at);
    if (!closed || closed < windowStart) return;
    moved(t.account_id).deliveries.push({ text: t.title || t.text || "—", closed: closed });
  });
  var whatMoved = Object.keys(movedByAcct).map(function (k) { return movedByAcct[k]; })
    .filter(function (a) { return a.meetings.length || a.pulses.length || a.deliveries.length; })
    .sort(function (a, b) {
      var sa = a.meetings.length + a.pulses.length + a.deliveries.length;
      var sb = b.meetings.length + b.pulses.length + b.deliveries.length;
      return sb - sa;
    });

  // ── 4. WHO HAS THE BALL — waiting-ons (App Coherence: mirrors Home "Your word") ──
  // owedMe: things blocked on someone else (they owe you) — the under-tracked dimension.
  // iOwe:   open commitments you're on the hook to deliver (you owe them).
  var owedMe = [];
  function pushWaiting(label, t, isProject) {
    if (!t || !t.waiting_on) return;
    if (isDone(t)) return;
    owedMe.push({
      label: label,
      who: t.waiting_on,
      since: isoDay(t.waiting_on_since) || null,
      account: nameOf(t.account_id),
      project: !!isProject,
    });
  }
  (bundle.tasks || []).forEach(function (t) { pushWaiting(t.title || t.text || "—", t, false); });
  (bundle.commitments || []).forEach(function (t) {
    // commitments may also carry waiting_on; don't double-list if already in tasks
    if (t && t.waiting_on && !(bundle.tasks || []).some(function (x) { return x && x.id === t.id; })) {
      pushWaiting(t.title || t.text || "—", t, false);
    }
  });
  (bundle.projects || []).forEach(function (p) { if (p && p.status !== "complete") pushWaiting(p.title || "Project", p, true); });

  var iOwe = open.concat(slipped).map(function (r) {
    return { label: r.text, account: r.account, due: r.due, slipped: r.due && r.due < today };
  });

  return {
    yourWord: { kept: kept, slipped: slipped, open: open },
    whatMoved: whatMoved,
    whoHasBall: { owedMe: owedMe, iOwe: iOwe },
    counts: {
      kept: kept.length, slipped: slipped.length, open: open.length,
      movedAccounts: whatMoved.length, owedMe: owedMe.length, iOwe: iOwe.length,
    },
  };
}

// ── 3. Fingerprint — TIME-STABLE (Sanity-Pass / F3 drift lock) ─────────────
// ONLY stored ids / timestamps / counts. NEVER Date.now() or "Xd ago" — a
// relative-time leak would change the hash daily and re-bill the model weekly→daily.
// mondayPack.test.js asserts "+1 day over identical data ⇒ same fingerprint".
export function computePackFingerprint(bundle) {
  bundle = bundle || {};
  var one = bundle.lastOneOnOne || null;
  var lead = bundle.leadershipTasks || [];
  var commitments = bundle.commitments || [];
  var meetings = bundle.meetings || [];
  var projects = bundle.projects || [];
  var tasks = bundle.tasks || [];
  var wins = bundle.wins || [];

  function maxOf(rows, fields) {
    var max = "";
    (rows || []).forEach(function (r) {
      if (!r) return;
      for (var i = 0; i < fields.length; i++) {
        var v = r[fields[i]];
        if (v != null && v !== "") { v = String(v); if (v > max) max = v; break; }
      }
    });
    return max;
  }
  function sig(rows) {
    return (rows || []).map(function (t) {
      return [(t && t.id) || "", isDone(t) ? "1" : "0", isoDay(t && t.closed_at), isoDay(t && t.due_date)].join("~");
    }).sort().join("|");
  }

  var maxProjUpdate = "";
  projects.forEach(function (p) {
    (p && Array.isArray(p.status_updates) ? p.status_updates : []).forEach(function (u) {
      if (u && u.at != null && String(u.at) > maxProjUpdate) maxProjUpdate = String(u.at);
    });
  });

  var canonical = {
    w: bundle.weekAnchor || bundle.windowStart || "",
    o: one ? [one.id || "", String(one.updated_at || "")] : [],
    l: { n: lead.length, u: maxOf(lead, ["updated_at", "created_at"]), s: sig(lead) },
    c: { n: commitments.length, s: sig(commitments) },
    m: { n: meetings.length, u: maxOf(meetings, ["updated_at", "created_at"]), d: maxOf(meetings, ["meeting_date"]) },
    p: { n: projects.length, st: projects.map(function (p) { return (p && p.status) || ""; }).sort().join(","), u: maxProjUpdate },
    t: { n: tasks.length, u: maxOf(tasks, ["updated_at", "created_at"]) },
    wn: { n: wins.length, u: maxOf(wins, ["created_at"]) }, // a newly-logged win refreshes the pack
  };
  return fnv1a(JSON.stringify(canonical));
}

// ── 4. Prompt payload for api/monday-pack.js (sections 0 + 2) ──────────────
// Compact "current state" lines (portfolio-digest altitude — see plan §2.4) so
// Pip can answer "where are we on X" without a full per-account context dump.
export function buildPackPromptPayload(bundle, sections) {
  bundle = bundle || {};
  sections = sections || buildPackSections(bundle);
  var one = bundle.lastOneOnOne || null;

  var lines = [];
  var w = sections.yourWord;
  if (w.kept.length)    lines.push("KEPT this week: " + w.kept.map(function (r) { return r.text + (r.account ? " (" + r.account + ")" : ""); }).slice(0, 8).join("; "));
  if (w.slipped.length) lines.push("SLIPPED (overdue): " + w.slipped.map(function (r) { return r.text + (r.account ? " (" + r.account + ")" : "") + (r.due ? " — due " + r.due : ""); }).slice(0, 8).join("; "));
  if (w.open.length)    lines.push("STILL OPEN: " + w.open.map(function (r) { return r.text + (r.account ? " (" + r.account + ")" : ""); }).slice(0, 8).join("; "));
  sections.whatMoved.slice(0, 10).forEach(function (a) {
    var bits = [];
    if (a.meetings.length) bits.push(a.meetings.length + " meeting" + (a.meetings.length > 1 ? "s" : ""));
    a.pulses.slice(0, 2).forEach(function (p) { bits.push("pulse: " + p.body); });
    if (a.deliveries.length) bits.push(a.deliveries.length + " delivered: " + a.deliveries.slice(0, 3).map(function (d) { return d.text; }).join(", "));
    if (bits.length) lines.push("MOVED — " + (a.account || "No account") + ": " + bits.join("; "));
  });
  sections.whoHasBall.owedMe.slice(0, 8).forEach(function (r) {
    lines.push("WAITING ON " + normalizePerson(r.who) + (r.since ? " (since " + r.since + ")" : "") + ": " + r.label + (r.account ? " (" + r.account + ")" : ""));
  });
  // Wins logged this window — so the read can credit what went right, not just chase what's open.
  var packWins = (bundle.wins || []).slice(0, 8);
  if (packWins.length) lines.push("WINS this week: " + packWins.map(function (w2) { return w2.title; }).join("; "));

  return {
    lastOneOnOne: one ? {
      date: isoDay(one.meeting_date),
      notes: trunc(one.notes, 2000),
      summary: trunc(one.pip_summary, 1200),
    } : null,
    leadershipTasks: (bundle.leadershipTasks || []).slice(0, 12).map(function (t) {
      return { title: t.title || t.text || "—", due: isoDay(t.due_date) || null };
    }),
    currentState: lines.join("\n"),
  };
}
