// Morning check-in (Game Plan Phase 1.2) — the two-way brief.
//
// Before Pip's operator report gets trusted, he asks up to 3 verification
// questions whose answers immediately correct the data underneath the report.
// Born from the "All Star Monday": a project's final step was done over the
// weekend but unmarked, and Pip screamed "overdue fire" at full confidence.
// One tap of truth from the user kills that whole class of confident-wrongness.
//
// Entirely deterministic — zero AI cost. Pure function so it's testable.
//
// Question kinds, in priority order:
//   deadline_passed — open item/commitment or project whose date just passed:
//                     "did it land?" (the All Star class)
//   stalled_hold    — a project held by someone 7+ days: "still stuck on them?"
//   stale_draft     — a meeting draft 2+ days old that was never summarized
//
// Per the Pip Data Line Rule: questions reference only titles/names the user
// already wrote — never solicit quantitative business data.

var MAX_QUESTIONS = 3;
var DEADLINE_LOOKBACK_DAYS = 4;
var HOLD_THRESHOLD_DAYS = 7;
var DRAFT_AGE_DAYS = 2;

function daysBetween(isoDate, todayISO) {
  return Math.floor(
    (new Date(todayISO + "T00:00:00").getTime() - new Date(isoDate + "T00:00:00").getTime()) / 86400000
  );
}

export function generateCheckInQuestions(input) {
  var items    = input.items    || [];
  var projects = input.projects || [];
  var meetings = input.meetings || [];
  var accounts = input.accounts || [];
  var todayISO = input.todayISO;
  var answered = input.answered || {}; // { [questionId]: answerId } — today's already-answered

  var acctName = {};
  accounts.forEach(function (a) { acctName[a.id] = a.name || ""; });

  var questions = [];

  // 1) deadline_passed — commitments first, then other items, then projects.
  var passedItems = items
    .filter(function (it) {
      if (it.done || it.status === "complete") return false;
      if (!it.due_date) return false;
      var d = daysBetween(it.due_date, todayISO);
      return d >= 1 && d <= DEADLINE_LOOKBACK_DAYS;
    })
    .sort(function (a, b) {
      // commitments outrank plain items; then most recently due first
      var c = (b.is_commitment ? 1 : 0) - (a.is_commitment ? 1 : 0);
      if (c !== 0) return c;
      return (b.due_date || "").localeCompare(a.due_date || "");
    });
  passedItems.forEach(function (it) {
    questions.push({
      id: "deadline_item_" + it.id,
      kind: "deadline_passed",
      targetKind: "item",
      targetId: it.id,
      accountName: it.account_id ? (acctName[it.account_id] || null) : null,
      text: "“" + (it.text || it.title || "An item") + "” was due " +
        (daysBetween(it.due_date, todayISO) === 1 ? "yesterday" : daysBetween(it.due_date, todayISO) + " days ago") +
        " — did it land?",
      options: [
        { id: "done",       label: "It's done ✓", tone: "good" },
        { id: "still_open", label: "Still open",       tone: "neutral" },
      ],
    });
  });
  projects.forEach(function (p) {
    if (p.status === "complete" || p.status === "draft") return;
    var date = p.expected_complete_date || p.due_date;
    if (!date) return;
    var d = daysBetween(date, todayISO);
    if (d < 1 || d > DEADLINE_LOOKBACK_DAYS) return;
    questions.push({
      id: "deadline_project_" + p.id,
      kind: "deadline_passed",
      targetKind: "project",
      targetId: p.id,
      accountName: p.account_id ? (acctName[p.account_id] || null) : null,
      text: "“" + (p.title || "A project") + "” was due to wrap " +
        (d === 1 ? "yesterday" : d + " days ago") + " — did it land?",
      options: [
        { id: "done",       label: "It's done ✓", tone: "good" },
        { id: "still_open", label: "Still open",       tone: "neutral" },
      ],
    });
  });

  // 2) stalled_hold — long holds, longest first.
  projects
    .filter(function (p) {
      return p.waiting_on && p.status !== "complete" && p.waiting_on_since &&
        daysBetween(p.waiting_on_since, todayISO) >= HOLD_THRESHOLD_DAYS;
    })
    .sort(function (a, b) { return (a.waiting_on_since || "").localeCompare(b.waiting_on_since || ""); })
    .forEach(function (p) {
      var held = daysBetween(p.waiting_on_since, todayISO);
      questions.push({
        id: "hold_" + p.id,
        kind: "stalled_hold",
        targetKind: "project",
        targetId: p.id,
        accountName: p.account_id ? (acctName[p.account_id] || null) : null,
        who: p.waiting_on,
        text: "“" + (p.title || "A project") + "” — still stuck on " + p.waiting_on +
          "? They've had it " + held + " days.",
        options: [
          { id: "still_stuck", label: "Still stuck — chase", tone: "warn" },
          { id: "it_moved",    label: "It moved ✓",          tone: "good" },
        ],
      });
    });

  // 3) stale_draft — unsummarized meeting drafts going cold.
  meetings
    .filter(function (m) {
      if (m.status !== "draft") return false;
      var ref = m.meeting_date || (m.created_at ? String(m.created_at).slice(0, 10) : null);
      if (!ref) return false;
      var d = daysBetween(ref, todayISO);
      return d >= DRAFT_AGE_DAYS && d <= 14;
    })
    // Oldest draft first — the one going coldest deserves the prompt.
    .sort(function (a, b) {
      var ar = a.meeting_date || (a.created_at ? String(a.created_at).slice(0, 10) : "");
      var br = b.meeting_date || (b.created_at ? String(b.created_at).slice(0, 10) : "");
      return ar.localeCompare(br);
    })
    .slice(0, 1)
    .forEach(function (m) {
      questions.push({
        id: "draft_" + m.id,
        kind: "stale_draft",
        targetKind: "meeting",
        targetId: m.id,
        accountId: m.account_id || null,
        accountName: m.account_id ? (acctName[m.account_id] || null) : null,
        text: "A meeting draft" + (m.account_id && acctName[m.account_id] ? " with " + acctName[m.account_id] : "") +
          " from " + (m.meeting_date || "earlier") + " was never summarized — still needed?",
        options: [
          { id: "open_it", label: "I'll finish it", tone: "neutral" },
          { id: "ignore",  label: "Let it go",      tone: "neutral" },
        ],
      });
    });

  // Drop already-answered, cap at MAX.
  return questions
    .filter(function (q) { return !answered[q.id]; })
    .slice(0, MAX_QUESTIONS);
}
