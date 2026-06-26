// accountContext.js — the ONE shared "what Pip knows about this account" renderer.
//
// THE PROBLEM THIS SOLVES (audit X6 / F1): the same per-account context used to be
// rendered by THREE independent functions that drifted apart —
//   - chat / Brief Me  : pipContext.renderAccountFull
//   - meeting summarize : pip.js summarizeDraftPip inline blocks (bp3/bp4)
//   - operator run      : api/operator-run.js renderAccountContext
// Every "Pip knows X in chat but not in summaries" bug was a manual patch to one
// of the three. This module is the structural cure: a single builder all three
// route through, so adding a field once reaches every surface that opts in.
//
// PURE MODULE — NO Supabase, NO React, NO fetch. Chat + summarize run client-side,
// operator-run runs server-side; all three import this file, so it must stay pure.
//
// USAGE:
//   buildAccountContext(account, opts)  -> structured { sections: [{key,text}] }
//   renderAccountContext(account, opts) -> prose string (sections joined)
// `account` is the merged per-account bundle (scalar fields + nested arrays:
// meetings, openItems, contacts, activeProjects, recentUpdates, healthSnapshots,
// promiseStats, operator state). Each surface maps its own data into this shape.
//
// `opts.surface` ∈ "chat" | "brief" | "summarize" | "operator" selects a defaults
// preset (SURFACE_DEFAULTS) that encodes the INTENTIONAL per-surface omissions and
// depth (the parity rule: wire a field to both paths, but surface-appropriate
// trimming stays explicit and reviewable in ONE place — right here).

import { computeContactEngagement } from "./contactEngagement.js";
import { renderNarrativeBlock } from "./accountNarrative.js";

// ── small pure helpers (ported so this module has no cross-file coupling) ──

function fmtDate(d) {
  if (!d) return "";
  return String(d);
}

function daysSince(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function trunc(s, n) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// Convert a raw email-like owner string into a readable name; pass names through.
function normalizePerson(str) {
  if (!str) return str;
  if (String(str).indexOf("@") > 0) return String(str).split("@")[0].replace(/[._]/g, " ");
  return str;
}

function typeLabel(t) {
  if (t === "internal_team") return "Department (internal team)";
  if (t === "partner")       return "Partner (3rd-party vendor)";
  if (t === "mso")           return "Customer (MSO)";
  if (t === "shop")          return "Customer (shop)";
  return "Customer";
}

function typeFocusHint(t) {
  if (t === "internal_team") return "Focus: cross-team deliverables, overdue commitments, and internal follow-ups.";
  if (t === "partner")       return "Focus: agreement status, renewal date, scope drift, spend trends.";
  return null;
}

// ── per-surface presets — the explicit, reviewable parity map ──
// Anything not listed here defaults via mergeOpts() below.
var SURFACE_DEFAULTS = {
  chat: {
    includeStatusLine: true, includeStatusOverride: true, includeTypeExtras: true,
    includeServicedStates: true, includeObjective: true, includeSystems: true,
    includeNarrative: true,
    includeMeetings: true, meetingLimit: 8, meetingNotesChars: 600, includeRawNotes: true,
    includeMeetingExtras: true,
    includeScheduled: true,
    includeOpenItems: true, openItemLimit: 10, itemMarkers: false,
    includeCommitments: true,
    includeContacts: true, contactLimit: 6, includeColdContacts: true, includeRelationships: true,
    includeProjects: true, projectLimit: 5,
    includeRecentUpdates: true, updateLimit: 6, includeUpdateDescription: true,
    includeHealthTrend: true, includeMetrics: true, metricsHealthStatus: false, includePromiseLog: true,
    includePortfolioThemes: true,
    includeOperatorRead: true, operatorFraming: "read", includeLessonsLearned: false,
    // F6 — semantic recall hits (older context surfaced by meaning). The caller
    // attaches a.recallHits; this builder only renders them. On for chat/brief.
    includeRecall: true, recallLimit: 4, recallChars: 280,
  },
  // Brief Me shares chat's depth — it's the moment to spend tokens on one account.
  brief: null, // filled below (= chat)
  summarize: {
    includeStatusLine: false, includeStatusOverride: false, includeTypeExtras: true,
    includeServicedStates: true, includeObjective: true, includeSystems: true,
    // Narrative off for summarize in v1 (it's about extracting THIS meeting, not
    // the long arc) — the section lives here so it can opt in later, zero render change.
    includeNarrative: false,
    includeMeetings: true, meetingLimit: 5, meetingNotesChars: 220, includeRawNotes: false,
    includeMeetingExtras: false,
    includeScheduled: false,
    includeOpenItems: false, openItemLimit: 10, itemMarkers: false,
    includeCommitments: true,
    includeContacts: true, contactLimit: 8, includeColdContacts: false, includeRelationships: true,
    includeProjects: false, projectLimit: 5,
    includeRecentUpdates: true, updateLimit: 6, includeUpdateDescription: false,
    includeHealthTrend: true, includeMetrics: true, metricsHealthStatus: false, includePromiseLog: true,
    includePortfolioThemes: false,
    includeOperatorRead: true, operatorFraming: "dont_repropose", includeLessonsLearned: false,
    // Off for summarize in v1 — it doesn't fetch recall hits (cost control). The
    // section lives here so the surface can opt in later with zero render change.
    includeRecall: false, recallLimit: 3, recallChars: 240,
  },
  operator: {
    includeStatusLine: true, includeStatusOverride: true, includeTypeExtras: true,
    includeServicedStates: false, includeObjective: true, includeSystems: true,
    // Operator generates its own read each run — don't feed it its own prior story.
    includeNarrative: false,
    includeMeetings: true, meetingLimit: 3, meetingNotesChars: 160, includeRawNotes: false,
    includeMeetingExtras: false,
    includeScheduled: false,
    includeOpenItems: true, openItemLimit: 8, itemMarkers: true,
    includeCommitments: false,
    includeContacts: true, contactLimit: 6, includeColdContacts: false, includeRelationships: false,
    includeProjects: true, projectLimit: 6,
    includeRecentUpdates: true, updateLimit: 2, includeUpdateDescription: false,
    includeHealthTrend: false, includeMetrics: true, metricsHealthStatus: true, includePromiseLog: false,
    includePortfolioThemes: false,
    includeOperatorRead: true, operatorFraming: "last_run", includeLessonsLearned: true,
    includeRecall: false, recallLimit: 3, recallChars: 240,
  },
};
SURFACE_DEFAULTS.brief = SURFACE_DEFAULTS.chat;

function mergeOpts(opts) {
  opts = opts || {};
  var base = SURFACE_DEFAULTS[opts.surface] || SURFACE_DEFAULTS.chat;
  var out = {};
  for (var k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
  for (var j in opts) { if (Object.prototype.hasOwnProperty.call(opts, j)) out[j] = opts[j]; }
  out.surface = opts.surface || "chat";
  return out;
}

// Normalize the operator state regardless of how the caller supplies it
// (chat passes flat operator_* fields; operator-run passes an `operator` object).
function readOperatorState(a) {
  var op = a.operator || {};
  return {
    headline:        op.headline        != null ? op.headline        : (a.operator_headline  || null),
    situation:       op.situation       != null ? op.situation       : (a.operator_situation || null),
    risks:           op.risks           != null ? op.risks           : (a.operator_risks     || []),
    delta:           op.delta           != null ? op.delta           : (a.operator_delta     || null),
    lessons_learned: op.lessons_learned != null ? op.lessons_learned : (a.lessons_learned    || null),
  };
}

// ── section renderers (each returns a string; "" means omit) ──────────────

function headerSection(a) {
  var headerSuffix = "";
  if (a.account_type && a.account_type !== "standard" && a.account_type !== "mso" && a.account_type !== "shop") {
    headerSuffix = " [" + typeLabel(a.account_type) + "]";
  } else if (a.account_type === "mso") {
    headerSuffix = " [MSO]";
  }
  return "ACCOUNT: " + a.name + headerSuffix + (a.id ? " (id: " + a.id + ")" : "");
}

function statusSection(a, o) {
  if (!o.includeStatusLine) return "";
  var bits = [];
  var status = a.status || "—";
  var health = a.health || "—";
  var isCustomerType = a.account_type !== "internal_team" && a.account_type !== "partner";
  // Only emit the full status line when there's a real signal. Operator accounts
  // don't fetch status/health/last_interaction — but still surface their tier so
  // it isn't dropped (the legacy operator renderer carried tier in the header).
  var hasSignal = a.status || a.health || a.last_interaction_at;
  if (!hasSignal) {
    if (a.tier && isCustomerType) return "Tier: " + a.tier;
    return "";
  }
  var last = a.last_interaction_at ? fmtDate(a.last_interaction_at) : "never";
  var ds = daysSince(a.last_interaction_at);
  var dsStr = ds == null ? "" : " (" + ds + "d ago)";
  var line = "Status: " + status + " · Health: " + health + " · Last contact: " + last + dsStr;
  if (a.tier && isCustomerType) line += " · Tier: " + a.tier;
  bits.push(line);
  return bits.join("\n");
}

function ownershipSection(a, o) {
  if (!a.owner_user_id || !o.userId || a.owner_user_id === o.userId) return "";
  // Keep the literal "RELATIONSHIP_OWNER: NO" token — operator-run's ACCOUNT_SYSTEM
  // prompt matches on it. The trailing sentence covers chat/summarize intent.
  return "RELATIONSHIP_OWNER: NO — this account is owned by someone else on the team; " +
    "the user is project-involved only. Don't assume the user has acted on it; mention who's " +
    "responsible and avoid suggesting outreach, follow-up, or cadence nudges.";
}

function statusOverrideSection(a, o) {
  if (!o.includeStatusOverride || !a.status_override) return "";
  return "Status override: " + a.status_override +
    (a.status_override_reason ? " (" + a.status_override_reason + ")" : "") +
    (a.status_override_at ? " — pinned " + fmtDate(a.status_override_at) : "") +
    (a.status_override_until ? ", expires " + a.status_override_until : "");
}

function typeExtrasSection(a, o) {
  if (!o.includeTypeExtras) return "";
  var lines = [];
  var focusHint = typeFocusHint(a.account_type);
  if (focusHint) lines.push(focusHint);
  if (a.account_type === "partner") {
    var partnerBits = [];
    if (a.agreement_end_date) partnerBits.push("Agreement ends: " + a.agreement_end_date);
    if (a.billing_terms)      partnerBits.push("Billing: " + a.billing_terms);
    if (a.spend_ytd != null)  partnerBits.push("Spend YTD: $" + a.spend_ytd);
    if (partnerBits.length) lines.push(partnerBits.join(" · "));
    if (a.scope_summary)      lines.push("Scope: " + trunc(a.scope_summary, 240));
  }
  if (a.tags && a.tags.length) lines.push("Tags: " + a.tags.join(", "));
  if (a.region) lines.push("Region: " + a.region);
  return lines.join("\n");
}

function servicedStatesSection(a, o) {
  if (!o.includeServicedStates) return "";
  var ss = a.serviced_states;
  if (!Array.isArray(ss) || !ss.length) return "";
  var ssStr = ss.length >= 48
    ? "National (" + ss.length + " states)"
    : ss.length + " states: " + ss.slice(0, 10).join(", ") + (ss.length > 10 ? "…" : "");
  return "Serviced states: " + ssStr;
}

function objectiveSection(a, o) {
  if (!o.includeObjective || !a.objective) return "";
  return "Account Intel: " + a.objective;
}

// Account Narrative Memory — Pip's re-derived 4-part STORY of the account (arc /
// standing / hinges-on / trajectory). The caller attaches the stored
// a.narrative object; this only renders it. Sits at the strategic top (right
// after the user's own Account Intel) so the story frames the raw rows below.
function narrativeSection(a, o) {
  if (!o.includeNarrative) return "";
  return renderNarrativeBlock(a.narrative);
}

function systemsSection(a, o) {
  if (!o.includeSystems || !Array.isArray(a.systems) || !a.systems.length) return "";
  return "Systems/tools they use: " + a.systems.map(function (s) {
    if (typeof s === "string") return s;
    return (s.name || "") + (s.note ? " (" + s.note + ")" : "");
  }).filter(Boolean).join(", ");
}

function meetingsSection(a, o) {
  if (!o.includeMeetings) return "";
  var meetings = Array.isArray(a.meetings) ? a.meetings.slice(0, o.meetingLimit) : [];
  if (!meetings.length) return "";
  var lines = ["Recent meetings (" + meetings.length + "):"];
  meetings.forEach(function (m) {
    var head = "- " + (m.date || m.meeting_date || "?") + " — \"" + (m.title || "Meeting") + "\"";
    if (m.attendees && m.attendees.length) head += " — attendees: " + m.attendees.join(", ");
    if (m.method && !o.includeRawNotes) head += " · via " + m.method;
    lines.push(head);
    // Chat surfaces the verbatim raw notes (searchability). Other surfaces use
    // Pip's own summary (cheaper, just history context).
    if (o.includeRawNotes && m.notes) lines.push("  Notes: " + trunc(m.notes, o.meetingNotesChars));
    if (o.includeRawNotes && Array.isArray(m.project_notes) && m.project_notes.length) {
      m.project_notes.forEach(function (pn) {
        lines.push("  Project note" + (pn.title ? " (" + pn.title + ")" : "") + ": " + trunc(pn.note, 300));
      });
    }
    var body = o.includeRawNotes
      ? (m.summary && m.summary.length > 0 ? trunc(m.summary, 180) : "")
      : trunc(m.summary || m.pip_summary || m.notes || "", o.meetingNotesChars);
    if (body) lines.push("  " + (o.includeRawNotes ? "Summary: " : "") + body);
    if (o.includeMeetingExtras) {
      if (m.action_items) lines.push("  Action items: " + trunc(m.action_items, 200));
      if (m.follow_up) lines.push("  Follow-up: " + m.follow_up);
    }
    if (m.theme) lines.push("  Theme: " + m.theme);
    if (m.tone || m.pip_tone) lines.push("  Tone: " + (m.tone || m.pip_tone));
  });
  return lines.join("\n");
}

function scheduledSection(a, o) {
  if (!o.includeScheduled) return "";
  var upcoming = Array.isArray(a.scheduledMeetings) ? a.scheduledMeetings.slice(0, 5) : [];
  if (!upcoming.length) return "";
  var lines = ["Upcoming scheduled meetings (" + upcoming.length + "):"];
  upcoming.forEach(function (m) {
    var head = "- " + (m.date || "?") + (m.time ? " " + m.time : "") + (m.method ? " · " + m.method : "");
    if (Array.isArray(m.account_ids) && m.account_ids.length > 1) head += " [multi-account meeting]";
    if (m.agenda) head += " — agenda: " + trunc(m.agenda, 160);
    lines.push(head);
  });
  return lines.join("\n");
}

// Open items (a.k.a. open tasks) — descriptive list with overdue/stale prefixes
// (chat) and commitment / waiting-on markers (operator). Commitments + overdue
// are sorted to the front so the cap never drops a signal-bearing row.
function openItemsSection(a, o) {
  if (!o.includeOpenItems) return "";
  var all = (Array.isArray(a.openItems) ? a.openItems : []).filter(function (i) {
    return !i.done && i.status !== "complete";
  });
  if (!all.length) return "";
  var todayStr = new Date().toISOString().slice(0, 10);
  var sorted = all.slice().sort(function (x, y) {
    function rank(i) {
      var due = i.due || i.due_date;
      if (i.is_commitment) return 0;
      if (due && due < todayStr) return 1;
      if (i.waiting_on) return 2;
      return 3;
    }
    return rank(x) - rank(y);
  });
  var items = sorted.slice(0, o.openItemLimit);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var lines = ["Open items (" + items.length + "):"];
  items.forEach(function (i) {
    var due = i.due || i.due_date || null;
    var prefix = "- ";
    var ageDays = i.created_at ? Math.max(0, Math.round((today - new Date(i.created_at)) / 86400000)) : null;
    if (due) {
      var diff = Math.round((new Date(due) - today) / 86400000);
      if (diff < 0) prefix = "- [overdue " + Math.abs(diff) + "d] ";
      else if (diff <= 7) prefix = "- [due in " + diff + "d] ";
    } else if (ageDays != null && ageDays >= 14) {
      prefix = "- [open " + ageDays + "d, no due date] ";
    }
    var tail = due
      ? " (due " + due + ")"
      : (ageDays != null ? " · opened " + ageDays + "d ago, no due date" : "");
    if (o.itemMarkers && i.is_commitment) tail += " · ✦ commitment";
    var owner = i.owner || i.assignee_email;
    if (owner) tail += " · owner: " + normalizePerson(owner);
    if (o.itemMarkers && i.waiting_on) tail += " · ⏳ waiting on " + i.waiting_on + (i.waiting_on_since ? " (since " + i.waiting_on_since + ")" : "");
    lines.push(prefix + (i.text || i.title || "—") + tail);
  });
  return lines.join("\n");
}

function commitmentsSection(a, o) {
  if (!o.includeCommitments) return "";
  var commitments = (Array.isArray(a.openItems) ? a.openItems : []).filter(function (i) {
    return i.is_commitment && !i.done && i.status !== "complete";
  });
  if (!commitments.length) return "";
  var todayStr = new Date().toISOString().slice(0, 10);
  var lines = ["COMMITMENTS (promised deliverables, " + commitments.length + "):"];
  commitments.slice(0, 5).forEach(function (c) {
    var due = c.due || c.due_date || null;
    var isOverdue = due && due < todayStr;
    var duePart = due ? " (due " + due + (isOverdue ? " — OVERDUE" : "") + ")" : "";
    var owner = c.owner || c.assignee_email;
    var tail = owner ? " · owner: " + normalizePerson(owner) : "";
    lines.push("- " + (c.text || c.title || "—") + duePart + tail);
  });
  return lines.join("\n");
}

function contactsSection(a, o) {
  if (!o.includeContacts) return "";
  var all = Array.isArray(a.contacts) ? a.contacts : [];
  if (!all.length) return "";
  // Sort primary, then champions/blockers, then the rest — so the cap keeps signal.
  var sorted = all.slice().sort(function (x, y) {
    function rank(c) {
      if (c.is_primary) return 0;
      if (c.relationship_role === "champion" || c.relationship_role === "blocker") return 1;
      return 2;
    }
    return rank(x) - rank(y);
  });
  var contacts = sorted.slice(0, o.contactLimit);
  var lines = ["Contacts (" + contacts.length + "):"];
  contacts.forEach(function (c) {
    var line = "- " + (c.name || "—");
    if (c.title) line += " — " + c.title;
    if (c.email) line += " — " + c.email;
    var flags = [];
    if (c.is_poc)     flags.push("POC");
    if (c.is_primary) flags.push("Primary");
    if (c.is_leader)  flags.push("Leader");
    if (c.relationship_role === "champion") flags.push("CHAMPION");
    if (c.relationship_role === "blocker")  flags.push("BLOCKER");
    if (flags.length) line += " [" + flags.join(", ") + "]";
    if (c.notes) line += " — " + String(c.notes).slice(0, 120);
    lines.push(line);
  });
  return lines.join("\n");
}

function coldContactsSection(a, o) {
  if (!o.includeColdContacts) return "";
  var contacts = (Array.isArray(a.contacts) ? a.contacts : []).slice(0, o.contactLimit);
  var meetings = Array.isArray(a.meetings) ? a.meetings : [];
  if (!contacts.length || !meetings.length) return "";
  var engagement = computeContactEngagement(contacts, meetings);
  var cold = contacts.filter(function (c) {
    var e = engagement[c.name];
    return e && e.daysSince !== null && e.daysSince > 30;
  });
  if (!cold.length) return "";
  var lines = ["CONTACTS NOT SEEN IN 30+ DAYS:"];
  cold.forEach(function (c) {
    var e = engagement[c.name];
    lines.push("- " + c.name + (c.title ? " (" + c.title + ")" : "") + " — last seen " + e.daysSince + " days ago");
  });
  return lines.join("\n");
}

function relationshipsSection(a, o) {
  if (!o.includeRelationships) return "";
  var rel = (Array.isArray(a.contacts) ? a.contacts : []).filter(function (c) {
    return c.relationship_role && c.relationship_role !== "unknown";
  });
  if (!rel.length) return "";
  var lines = ["── RELATIONSHIPS ──"];
  rel.forEach(function (c) {
    var role = c.relationship_role.charAt(0).toUpperCase() + c.relationship_role.slice(1);
    var line = role + ": " + (c.name || "—");
    if (c.relationship_note) line += " — " + c.relationship_note;
    lines.push(line);
  });
  return lines.join("\n");
}

function projectsSection(a, o) {
  if (!o.includeProjects) return "";
  var projects = Array.isArray(a.activeProjects) ? a.activeProjects.slice(0, o.projectLimit) : [];
  if (!projects.length) return "";
  var lines = ["Active projects (" + projects.length + "):"];
  projects.forEach(function (p) {
    var line = "- " + p.title + " · " + (p.status || "—").replace("_", " ");
    if (p.due_date) line += " · due " + p.due_date;
    if (p.assignee) line += " · assigned: " + normalizePerson(p.assignee);
    if (p.requested_by) line += " · requested by: " + normalizePerson(p.requested_by);
    if (p.waiting_on) line += " · WAITING ON: " + p.waiting_on + (p.waiting_on_since ? " (since " + p.waiting_on_since + ")" : "");
    lines.push(line);
    var ups = Array.isArray(p.status_updates) ? p.status_updates.slice(0, 3) : [];
    ups.forEach(function (u, i) {
      if (!u || !u.body) return;
      lines.push("    " + (i === 0 ? "latest" : "prior") + " (" + (u.at ? String(u.at).slice(0, 10) : "?") + "): " + trunc(u.body, 140));
    });
    var tasks = Array.isArray(p.tasks)
      ? p.tasks.filter(function (t) { return !t.completed_at && !t.done; }).slice(0, 5)
      : [];
    tasks.forEach(function (t) {
      var tLine = "    task: " + (t.title || t.text || "—");
      var assignee = t.assignee_email || t.assignee;
      if (assignee) tLine += " — assigned: " + normalizePerson(assignee);
      if (t.recipient) tLine += " — recipient: " + normalizePerson(t.recipient);
      lines.push(tLine);
    });
  });
  return lines.join("\n");
}

function recentUpdatesSection(a, o) {
  if (!o.includeRecentUpdates) return "";
  var updates = Array.isArray(a.recentUpdates) ? a.recentUpdates.slice(0, o.updateLimit) : [];
  if (!updates.length) return "";
  var lines = ["Recent updates (" + updates.length + "):"];
  updates.forEach(function (u) {
    var parts = ["- " + (u.update_date || "?")];
    if (u.update_type) parts.push(u.update_type);
    if (u.owner)       parts.push(normalizePerson(u.owner));
    var head = parts.join(" · ") + " · " + (u.title || u.description || "—");
    if (u.observed_impact) head += " [impact: " + u.observed_impact + "]";
    lines.push(head);
    if (o.includeUpdateDescription && u.description) lines.push("  " + trunc(u.description, 200));
  });
  return lines.join("\n");
}

// Sort snapshots ascending by date.
function sortSnaps(snaps) {
  return snaps.slice().sort(function (a, b) {
    return (a.snapshot_date || "") > (b.snapshot_date || "") ? 1 : -1;
  });
}

function healthTrendSection(a, o) {
  if (!o.includeHealthTrend) return "";
  var snaps = Array.isArray(a.healthSnapshots) ? a.healthSnapshots : [];
  if (snaps.length < 3) return "";
  var statuses = sortSnaps(snaps).map(function (s) { return s.health_status || "unknown"; });
  var first = statuses[0];
  if (statuses.every(function (s) { return s === first; })) return "";
  return "HEALTH TREND (last " + statuses.length + " snapshots): " + statuses.join(" → ");
}

function metricsSection(a, o) {
  if (!o.includeMetrics) return "";
  // Prefer the latest of the snapshot array; fall back to a single `snapshot`
  // (operator-run passes one snapshot row, not the history array).
  var latest = null;
  if (Array.isArray(a.healthSnapshots) && a.healthSnapshots.length) {
    latest = sortSnaps(a.healthSnapshots)[a.healthSnapshots.length - 1];
  } else if (a.snapshot) {
    latest = a.snapshot;
  }
  if (!latest) return "";
  var parts = [];
  // Operator (no status line) wants health_status in the metrics line; chat /
  // summarize already show it via the status line / health trend, so omit.
  if (o.metricsHealthStatus && latest.health_status != null) {
    parts.push("Health: " + latest.health_status);
  }
  if (latest.health_score != null)        parts.push("Score: " + Math.round(latest.health_score));
  if (latest.days_since_contact != null)  parts.push("Days since contact: " + latest.days_since_contact);
  if (latest.open_item_count != null)     parts.push("Open items: " + latest.open_item_count);
  if (latest.overdue_item_count != null)  parts.push("Overdue: " + latest.overdue_item_count);
  if (latest.active_project_count != null) parts.push("Active projects: " + latest.active_project_count);
  if (!parts.length) return "";
  return "Account metrics: " + parts.join(" · ");
}

function promiseLogSection(a, o) {
  if (!o.includePromiseLog) return "";
  var ps = a.promiseStats;
  if (!ps || !ps.avgDays || ps.avgDays <= 0) return "";
  var lines = ["DELIVERY TRACK RECORD (this account):"];
  lines.push("- Average days to close a commitment: ~" + ps.avgDays + "d");
  var recent = Array.isArray(ps.recentItems) ? ps.recentItems : [];
  if (recent.length) {
    var closes = recent.slice(0, 5).map(function (r) {
      return '"' + (r.item_text || "—").slice(0, 60) + '" (' + (r.days_to_complete != null ? r.days_to_complete + "d" : "?") + ')';
    });
    lines.push("- Recent closes: " + closes.join(", "));
  }
  return lines.join("\n");
}

function portfolioThemesSection(a, o) {
  if (!o.includePortfolioThemes) return "";
  var themes = a.portfolioThemes;
  if (!themes || !themes.length) return "";
  var significant = themes.filter(function (t) { return t.count >= 2; });
  if (!significant.length) return "";
  var lines = ["PORTFOLIO PATTERNS (recurring themes across accounts, last 90d):"];
  significant.slice(0, 5).forEach(function (t) {
    var accts = t.accounts && t.accounts.length ? " (" + t.accounts.join(", ") + ")" : "";
    lines.push("- " + t.theme + ": " + t.count + " meetings" + accts);
  });
  return lines.join("\n");
}

function operatorReadSection(a, o) {
  if (!o.includeOperatorRead) return "";
  var op = readOperatorState(a);
  var lines = [];
  if (o.operatorFraming === "last_run") {
    // operator-run: prior-run situation feeds the "since last run" delta.
    if (o.includeLessonsLearned && op.lessons_learned) {
      lines.push("LESSONS PIP HAS LEARNED ON THIS ACCOUNT:");
      lines.push(trunc(op.lessons_learned, 300));
    }
    if (op.situation) {
      lines.push("WHAT PIP SAID LAST RUN (for the 'since last run' delta):");
      lines.push(trunc(op.situation, 300));
    }
    return lines.join("\n");
  }
  if (!op.headline && !op.situation && !(op.risks && op.risks.length)) return "";
  if (o.operatorFraming === "dont_repropose") {
    // summarize: don't re-propose work already flagged.
    lines.push("── PIP'S RECENT READ ON THIS ACCOUNT (already surfaced — don't re-propose these as brand-new) ──");
    if (op.situation) lines.push(op.situation);
    if (op.risks && op.risks.length) {
      lines.push("Already-flagged open risks: " + op.risks.map(function (r) {
        return typeof r === "string" ? r : (r && r.text ? r.text : "");
      }).filter(Boolean).slice(0, 6).join("; "));
    }
    return lines.join("\n");
  }
  // chat/brief: Pip's overnight read as context.
  lines.push("── PIP'S OVERNIGHT OPERATOR READ ──");
  if (op.headline) lines.push("Headline: " + op.headline);
  if (op.situation) lines.push("Situation: " + op.situation);
  if (op.risks && op.risks.length) lines.push("Risks: " + op.risks.join(" · "));
  if (op.delta) lines.push("Since last run: " + op.delta);
  return lines.join("\n");
}

// F6 — recall hits. Human-readable label per source type, so the model can tell
// recalled (older, surfaced-by-meaning) context from current context.
export function recallSourceLabel(t) {
  if (t === "meeting_notes")   return "meeting note";
  if (t === "meeting_summary") return "meeting summary";
  if (t === "project_note")    return "project note";
  if (t === "account_update")  return "account update";
  return "note";
}

// Render the semantic-recall hits the caller attached (a.recallHits). Each hit:
//   { content, source_type, source_id?, date?, similarity? }
// Hits are assumed already ordered by relevance (the match RPC orders by cosine).
function recallSection(a, o) {
  if (!o.includeRecall) return "";
  var hits = Array.isArray(a.recallHits) ? a.recallHits : [];
  if (!hits.length) return "";
  var lines = ["RELEVANT PAST NOTES (semantic recall — older context surfaced by meaning, may pre-date the recent meetings above):"];
  hits.slice(0, o.recallLimit).forEach(function (h) {
    if (!h || !h.content) return;
    var meta = recallSourceLabel(h.source_type);
    if (h.date) meta += " · " + String(h.date).slice(0, 10);
    lines.push("- [" + meta + "] " + trunc(h.content, o.recallChars));
  });
  return lines.length > 1 ? lines.join("\n") : "";
}

// Ordered list of section renderers. Order matches the legacy renderAccountFull
// so chat output stays byte-close (the existing pipContext tests lock it).
var SECTION_ORDER = [
  ["header",          headerSection,           true],   // header never gets a blank line before it
  ["status",          statusSection,           false],
  ["ownership",       ownershipSection,        false],
  ["statusOverride",  statusOverrideSection,   false],
  ["typeExtras",      typeExtrasSection,       false],
  ["servicedStates",  servicedStatesSection,   false],
  ["objective",       objectiveSection,        false],
  ["narrative",       narrativeSection,        true],
  ["systems",         systemsSection,          false],
  ["meetings",        meetingsSection,         true],
  ["scheduled",       scheduledSection,        true],
  ["openItems",       openItemsSection,        true],
  ["commitments",     commitmentsSection,      true],
  ["contacts",        contactsSection,         true],
  ["coldContacts",    coldContactsSection,     true],
  ["relationships",   relationshipsSection,    true],
  ["projects",        projectsSection,         true],
  ["recentUpdates",   recentUpdatesSection,    true],
  ["healthTrend",     healthTrendSection,      true],
  ["metrics",         metricsSection,          true],
  ["promiseLog",      promiseLogSection,       true],
  ["portfolioThemes", portfolioThemesSection,  true],
  ["operatorRead",    operatorReadSection,     true],
  ["recall",          recallSection,           true],
];

/**
 * Build the canonical per-account context as a structured object.
 * @param {Object} account - merged per-account bundle (scalars + nested arrays)
 * @param {Object} opts    - { surface, userId, ...overrides }
 * @returns {{ sections: Array<{key,text,spaced}>, surface: string }}
 */
export function buildAccountContext(account, opts) {
  var o = mergeOpts(opts);
  var a = account || {};
  var sections = [];
  SECTION_ORDER.forEach(function (entry) {
    var key = entry[0], fn = entry[1], headerOrSpaced = entry[2];
    var text = fn(a, o);
    if (text && text.length) sections.push({ key: key, text: text, spaced: headerOrSpaced });
  });
  return { sections: sections, surface: o.surface };
}

/**
 * Render the canonical per-account context as prose.
 * Sections flagged `spaced` get a blank line before them (matching the legacy
 * renderAccountFull layout); the header + the leading status/ownership/intel
 * lines pack together without blank separators.
 */
export function renderAccountContext(account, opts) {
  var built = buildAccountContext(account, opts);
  var out = [];
  built.sections.forEach(function (s, idx) {
    if (idx === 0) { out.push(s.text); return; }
    if (s.spaced) out.push("");        // blank line before spaced blocks
    out.push(s.text);
  });
  return out.join("\n");
}

// ── F2/F3 — content fingerprint for event-driven recompute ────────────────
//
// computeContextFingerprint(bundle) -> short stable string.
//
// THE POINT (F3): the server (api/pip-state-refresh.js) hashes the signal-
// bearing inputs of an account and skips the Haiku recompute when the hash is
// unchanged since the last compute. So this is change-detection, NOT security —
// a tiny FNV-1a string hash is plenty.
//
// THE CRUX (Sanity-Pass Rule): the fingerprint must be TIME-STABLE. It must use
// ONLY stored timestamps / ids / counts — NEVER Date.now(), "Xd ago", or any
// value derived from the current time. If a relative-time value leaks in, the
// hash changes every day → recompute every day → the cost cut silently evaporates.
// `accountContext.test.js` mocks "+1 day" over identical data and asserts the
// fingerprint is unchanged — that test is the drift lock for this property.
//
// `bundle` carries the RAW DB rows the server already loaded (not the
// buildAccountContext-mapped shape, which drops updated_at):
//   { account, meetings, tasks, contacts, projects, updates }
// Any missing array is treated as empty. The function is order-independent
// (it aggregates to counts + maxima), so row order never affects the result.

function fnv1a(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 with 32-bit overflow, via the shift-add identity.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // base36 keeps it short.
  return h.toString(36);
}

// Cheap stable string hash for free-text fields (objective, contact roster).
function hashStr(s) {
  if (!s) return "0";
  return fnv1a(String(s));
}

// Max stored value across rows for the first present candidate field per row
// (ISO timestamps + YYYY-MM-DD dates both sort lexicographically). "" if none.
function maxField(rows, fields) {
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

export function computeContextFingerprint(bundle) {
  bundle = bundle || {};
  var a  = bundle.account  || {};
  var ms = bundle.meetings || [];
  var ts = bundle.tasks    || [];
  var cs = bundle.contacts || [];
  var ps = bundle.projects || [];
  var us = bundle.updates  || [];

  var openTasks = 0, doneTasks = 0;
  ts.forEach(function (t) {
    if (!t) return;
    if (t.done || t.status === "complete") doneTasks++;
    else openTasks++;
  });

  // Max timestamp across all project status_updates (jsonb [{body,at,by}]).
  var maxProjUpdate = "";
  ps.forEach(function (p) {
    var ups = p && Array.isArray(p.status_updates) ? p.status_updates : [];
    ups.forEach(function (u) {
      if (u && u.at != null && String(u.at) > maxProjUpdate) maxProjUpdate = String(u.at);
    });
  });

  // Contact roster signature — order-independent (sorted) over the fields that
  // change Pip's read (name, relationship role, primary flag).
  var contactSig = cs.map(function (c) {
    return [(c && c.name) || "", (c && c.relationship_role) || "", (c && c.is_primary) ? "1" : "0"].join("|");
  }).sort().join("¦");

  var projectStatuses = ps.map(function (p) { return (p && p.status) || ""; }).sort().join(",");

  var canonical = {
    a: [
      a.id || "", a.name || "", a.status || "", a.status_override || "", a.tier || "",
      a.account_type || "", a.owner_user_id || "", a.last_interaction_at || "",
      hashStr(a.objective || ""),
      Array.isArray(a.systems) ? a.systems.map(function (s) {
        return typeof s === "string" ? s : ((s && s.name) || "");
      }).sort().join(",") : "",
    ],
    m: { n: ms.length, u: maxField(ms, ["updated_at", "created_at"]), d: maxField(ms, ["meeting_date"]) },
    t: { o: openTasks, c: doneTasks, u: maxField(ts, ["updated_at", "created_at"]) },
    c: { n: cs.length, h: hashStr(contactSig) },
    p: { n: ps.length, s: projectStatuses, u: maxProjUpdate },
    u: { n: us.length, d: maxField(us, ["update_date", "updated_at", "created_at"]) },
  };

  return fnv1a(JSON.stringify(canonical));
}
