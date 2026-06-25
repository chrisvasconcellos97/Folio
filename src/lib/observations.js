// The Mastermind / Synthesis layer (item 52) — PURE helpers.
//
// Pip reads the recent capture/work STREAM and proposes a SMALL number of
// high-confidence "observations" (you keep mentioning X → make a project? · two
// accounts blocked on the same person · a promise that never closes). This module
// holds the deterministic pieces; the Sonnet pass lives in api/observations.js.
//
// THREE locked design rules enforced here:
//  1. PRECISION OVER VOLUME — the 4-part insight gate (validateObservations)
//     drops anything that can't answer evidence / why / action / outcome, then
//     caps the set. "No observation" is a valid output.
//  2. FINGERPRINT-GATED — computeStreamFingerprint hashes STABLE inputs only
//     (ids / dates / counts, never relative-time) so the expensive pass re-runs
//     ONLY when the stream actually moved. Same stream tomorrow → same hash → $0.
//  3. DATA LINE — buildStreamSummary emits titles / themes / who-has-ball /
//     elapsed-days only, never raw business numbers.

function nonEmpty(s) { return typeof s === "string" && s.trim().length > 0; }

function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return null;
  var a = new Date(aISO).getTime(), b = new Date(bISO).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.floor(Math.abs(b - a) / 86400000);
}

// Stable, drift-proof fingerprint of the stream. Uses ids + dates + counts —
// NEVER Date.now() or relative ages — so "the same stream a day later" hashes
// identically (the F3 drift-lock discipline).
export function computeStreamFingerprint(input) {
  input = input || {};
  var parts = [];

  (input.tasks || []).slice().sort(byId).forEach(function (t) {
    parts.push("t:" + t.id + ":" + (t.updated_at || t.created_at || "") + ":" + (t.done ? 1 : 0) + ":" + (t.waiting_on || ""));
  });
  (input.meetings || []).slice().sort(byId).forEach(function (m) {
    parts.push("m:" + m.id + ":" + (m.meeting_date || "") + ":" + (m.theme || ""));
  });
  (input.themes || []).slice().sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); }).forEach(function (th) {
    parts.push("th:" + th.key + ":" + (th.count || 0));
  });

  return hashString(parts.join("|"));
}

function byId(a, b) { return String(a.id).localeCompare(String(b.id)); }

// Small deterministic string hash (djb2). Not crypto — just a stable cache key.
function hashString(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "ob_" + (h >>> 0).toString(36);
}

// Compact the recent stream into the text the synthesis prompt reasons over.
// Bounded + data-line-safe: titles, themes, who-has-ball, elapsed days only.
export function buildStreamSummary(input, opts) {
  input = input || {};
  var todayISO = (opts && opts.todayISO) || null;
  var lines = [];

  var acctName = {};
  (input.accounts || []).forEach(function (a) { acctName[a.id] = a.name; });
  function nameFor(id) { return (id && acctName[id]) ? acctName[id] : null; }

  // Open commitments the user owes.
  var commitments = (input.tasks || []).filter(function (t) { return t.is_commitment && !t.done; });
  if (commitments.length) {
    lines.push("OPEN COMMITMENTS (you owe):");
    commitments.slice(0, 20).forEach(function (t) {
      var an = nameFor(t.account_id);
      var age = todayISO && t.created_at ? daysBetween(t.created_at, todayISO) : null;
      lines.push("- " + (t.title || "—") + (an ? " · " + an : "") + (t.due_date ? " · due " + t.due_date : "") + (age != null ? " · opened " + age + "d ago" : ""));
    });
  }

  // Waiting-ons (who has the ball), aged.
  var waiting = (input.tasks || []).filter(function (t) { return t.waiting_on && !t.done; });
  if (waiting.length) {
    lines.push("WAITING ON OTHERS (they owe you):");
    waiting.slice(0, 20).forEach(function (t) {
      var an = nameFor(t.account_id);
      var since = todayISO && t.waiting_on_since ? daysBetween(t.waiting_on_since, todayISO) : null;
      lines.push("- " + (t.title || "—") + (an ? " · " + an : "") + " · waiting on " + t.waiting_on + (since != null ? " · " + since + "d, no movement" : ""));
    });
  }

  // Recent touches (meetings/captures), newest first — the activity texture.
  var meetings = (input.meetings || []).slice().sort(function (a, b) { return String(b.meeting_date).localeCompare(String(a.meeting_date)); });
  if (meetings.length) {
    lines.push("RECENT TOUCHES:");
    meetings.slice(0, 20).forEach(function (m) {
      var an = nameFor(m.account_id);
      lines.push("- " + (m.meeting_date || "") + (an ? " · " + an : "") + (m.title ? " · " + m.title : "") + (m.theme ? " · [" + m.theme + "]" : ""));
    });
  }

  // Recurring themes across accounts (the convergence signal).
  var themes = (input.themes || []).filter(function (th) { return (th.count || 0) >= 2; });
  if (themes.length) {
    lines.push("RECURRING THEMES (across the portfolio):");
    themes.slice(0, 12).forEach(function (th) {
      var accts = (th.accounts || []).map(function (id) { return nameFor(id) || id; }).filter(Boolean);
      lines.push("- \"" + th.key + "\" — came up " + th.count + "× " + (accts.length ? "(" + accts.slice(0, 5).join(", ") + ")" : ""));
    });
  }

  return lines.join("\n");
}

// THE 4-PART INSIGHT GATE. Every observation must answer all four — evidence,
// why it matters, a proposed action, an expected outcome — or it says NOTHING.
// Then cap (precision over volume). Returns the surviving observations.
export function validateObservations(arr, opts) {
  var max = (opts && opts.max) || 2;
  return (Array.isArray(arr) ? arr : [])
    .filter(function (o) {
      return o
        && nonEmpty(o.evidence)
        && nonEmpty(o.why)
        && nonEmpty(o.action_label)
        && nonEmpty(o.expected);
    })
    .slice(0, max);
}
