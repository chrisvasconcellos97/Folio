// Context curation and prose rendering for Pip.
//
// Two responsibilities:
//   1. curateContext(raw, message, focusedAccountIds) — drop irrelevant accounts
//      from the payload, OR fall back to a list-only summary view.
//   2. renderContextProse(curated) — render the curated payload as compact
//      prose (not JSON) so the model spends fewer tokens parsing structure.
//
// Both functions are pure; safe to call on either client or server.

import { renderAccountContext, recallSourceLabel } from "./accountContext.js";

// Resolve account names mentioned in the message + the prior assistant message
// (for follow-up context). Returns array of account objects, deduped.
// Also resolves via contact names — if a person's name matches a contact on an
// account, that account is focused (e.g. "Tony" → Aftermarket Team because Tony
// is a contact there).
function resolveMentionedAccounts(accounts, messageText) {
  if (!accounts || !accounts.length || !messageText) return [];
  var lower = String(messageText).toLowerCase();
  var matches = [];
  var seen = {};
  accounts.forEach(function (a) {
    if (!a || !a.name) return;
    var name = a.name.toLowerCase();
    // Full account name substring match
    if (name.length >= 3 && lower.indexOf(name) !== -1) {
      if (!seen[a.id]) { seen[a.id] = true; matches.push(a); }
      return;
    }
    // Distinctive word from account name (≥3 chars, not a stopword)
    var words = name.split(/\s+/).filter(function (w) {
      return w.length >= 3 && ["and", "the", "for", "auto", "inc", "llc", "corp", "ltd", "group"].indexOf(w) === -1;
    });
    var hit = words.some(function (w) {
      return new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(messageText);
    });
    if (hit) {
      if (!seen[a.id]) { seen[a.id] = true; matches.push(a); }
      return;
    }
    // Contact name match — check first name and full name of every contact on
    // this account so "Tony" resolves to the account Tony is listed on.
    if (Array.isArray(a.contacts)) {
      var contactHit = a.contacts.some(function (c) {
        if (!c || !c.name) return false;
        var cname = c.name.toLowerCase().trim();
        // Full contact name
        if (cname.length >= 2 && lower.indexOf(cname) !== -1) return true;
        // First name only (≥3 chars to avoid noise)
        var firstName = cname.split(/\s+/)[0];
        if (firstName.length >= 3) {
          return new RegExp("\\b" + firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(messageText);
        }
        return false;
      });
      if (contactHit && !seen[a.id]) { seen[a.id] = true; matches.push(a); }
    }
  });
  return matches;
}

// Pick a compact subset of the raw context based on the user message and
// optional focusedAccountIds. If focused accounts are given, those win.
// Otherwise resolve via substring match. If nothing matches, return a
// list-only view of all accounts (no nested meetings/items/contacts).
//
// `mode` (optional) — when "brief", we always render full detailed context
// for the focused account (no shortcut via cached state). For other modes the
// caller can attach a `cachedState` map (accountId → prose) on each account
// to opt into the cheaper rolling-state path.
export function curateContext(raw, message, focusedAccountIds, opts) {
  opts = opts || {};
  var briefMode = opts.mode === "brief";
  if (!raw || typeof raw !== "object") return { mode: "empty", accounts: [], briefMode: briefMode };
  var accounts = Array.isArray(raw.accounts) ? raw.accounts : [];

  var focused = [];
  if (focusedAccountIds && focusedAccountIds.length) {
    focused = accounts.filter(function (a) {
      return focusedAccountIds.indexOf(a.id) !== -1;
    });
  }
  if (!focused.length) {
    focused = resolveMentionedAccounts(accounts, message);
  }

  if (focused.length > 0) {
    // Full nested context for matched accounts only.
    return {
      mode: "focused",
      briefMode: briefMode,
      accounts: focused,
      openQuickTasks: raw.openQuickTasks || [],
      upcomingTaskCadences: raw.upcomingTaskCadences || [],
      activeGaugeProjects: raw.activeGaugeProjects || [],
      recentDeliveries: raw.recentDeliveries || [],
      globalPeople: raw.globalPeople || [],
      userId: raw.userId || null,
    };
  }

  // No matches — list-only view. Drop nested meetings/items/contacts.
  var listOnly = accounts.map(function (a) {
    return {
      id:     a.id,
      name:   a.name,
      status: a.status,
      tier:   a.tier,
      health: a.health,
      last_interaction_at: a.last_interaction_at,
      account_type: a.account_type,
    };
  });
  return {
    mode: "list",
    briefMode: briefMode,
    accounts: listOnly,
    openQuickTasks: raw.openQuickTasks || [],
    upcomingTaskCadences: raw.upcomingTaskCadences || [],
    activeGaugeProjects: raw.activeGaugeProjects || [],
    recentDeliveries: raw.recentDeliveries || [],
    globalPeople: raw.globalPeople || [],
    userId: raw.userId || null,
  };
}

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

// Compact "cached state" rendering — used when a fresh state_prose blob is
// available and the caller is OK with the lighter view (chat mode mostly).
// The cached prose is treated as the body; we still emit the ACCOUNT header
// and a minimal status line so the model can find the id.
function renderAccountCached(a) {
  var lines = [];
  lines.push("ACCOUNT: " + a.name + (a.id ? " (id: " + a.id + ")" : ""));
  var status = a.status || "—";
  var health = a.health || "—";
  var last   = a.last_interaction_at ? fmtDate(a.last_interaction_at) : "never";
  var ds     = daysSince(a.last_interaction_at);
  var dsStr  = ds == null ? "" : " (" + ds + "d ago)";
  lines.push("Status: " + status + " · Health: " + health + " · Last contact: " + last + dsStr);
  lines.push("");
  lines.push("Pip's cached read: " + a.cachedState);
  return lines.join("\n");
}

function renderAccountListItem(a) {
  var bits = [a.name];
  if (a.account_type === "internal_team") bits.push("department");
  else if (a.account_type === "partner")  bits.push("partner");
  if (a.status) bits.push(a.status);
  if (a.health) bits.push("health=" + a.health);
  var ds = daysSince(a.last_interaction_at);
  if (ds != null) bits.push(ds + "d ago");
  return "- " + bits.join(" · ");
}

// Render the curated context as compact prose. The output is meant to be
// appended to the (uncached) per-request system block.
export function renderContextProse(curated) {
  if (!curated || !curated.accounts) return "";
  var sections = [];

  // Surface the user's own department at the very top so Pip knows which team
  // is "us" vs. external accounts/customers.
  var myDept = (curated.accounts || []).find(function (a) { return a.is_my_department; });
  if (myDept) {
    sections.push("MY TEAM: " + myDept.name + " — the user's own department. Internal meetings and team members here are the user's direct colleagues, not customers.");
  }

  // People directory — everyone the user already knows (all accounts + internal
  // team). Lets chat Pip recognize a named person instead of suggesting them as
  // a brand-new contact (the #1 reported failure).
  if (Array.isArray(curated.globalPeople) && curated.globalPeople.length) {
    var pplLines = curated.globalPeople.slice(0, 400).map(function (p) {
      return "- " + [p.name, p.account, p.title].filter(Boolean).join(" · ");
    });
    sections.push("PEOPLE YOU ALREADY KNOW (all accounts + internal team — do NOT treat these as new contacts):\n" + pplLines.join("\n"));
  }

  if (curated.mode === "list") {
    sections.push("ACCOUNTS (list view — " + curated.accounts.length + " total):");
    sections.push(curated.accounts.map(renderAccountListItem).join("\n"));
  } else if (curated.mode === "focused" && curated.accounts.length > 0) {
    var curatedUserId = curated.userId || null;
    curated.accounts.forEach(function (a) {
      // Phase 2: prefer the rolling cached state when it's fresh and the
      // caller did NOT mark this as a brief-mode request. Brief mode wants
      // the full raw data because that's the moment to spend tokens.
      if (a.cachedState && !curated.briefMode) {
        sections.push(renderAccountCached(a));
      } else {
        // F1 — one shared per-account renderer (src/lib/accountContext.js).
        sections.push(renderAccountContext(a, {
          surface: curated.briefMode ? "brief" : "chat",
          userId: curatedUserId,
        }));
      }
    });
  }

  // F6 — global semantic-recall lane (list mode / "across all accounts"). Older
  // context surfaced by meaning, account-labeled, deduped by source_id.
  if (Array.isArray(curated.globalRecall) && curated.globalRecall.length) {
    var seenSrc = {};
    var recallLines = ["", "RELEVANT PAST CONTEXT (semantic recall across all accounts — older notes surfaced by meaning):"];
    curated.globalRecall.slice(0, 6).forEach(function (h) {
      if (!h || !h.content) return;
      if (h.source_id && seenSrc[h.source_id]) return;
      if (h.source_id) seenSrc[h.source_id] = true;
      var label = recallSourceLabel(h.source_type);
      if (h.account_name) label += " · " + h.account_name;
      recallLines.push("- [" + label + "] " + trunc(h.content, 280));
    });
    if (recallLines.length > 2) sections.push(recallLines.join("\n"));
  }

  if (curated.openQuickTasks && curated.openQuickTasks.length) {
    var taskLines = ["", "OPEN QUICK TASKS (" + curated.openQuickTasks.length + "):"];
    curated.openQuickTasks.forEach(function (t) {
      var line = "- [id:" + t.id + "] " + t.title;
      if (t.account) line += " (" + t.account + ")";
      if (t.notes) line += " — " + trunc(t.notes, 120);
      taskLines.push(line);
    });
    sections.push(taskLines.join("\n"));
  }

  if (curated.upcomingTaskCadences && curated.upcomingTaskCadences.length) {
    var soon = curated.upcomingTaskCadences.filter(function (c) {
      return c.daysUntil != null && c.daysUntil <= 7;
    });
    if (soon.length) {
      var cadLines = ["", "UPCOMING TASK CADENCES (next 7d):"];
      soon.forEach(function (c) {
        var line = "- " + c.task + " · " + c.schedule + " · next " + c.nextDue + " (" + c.daysUntil + "d)";
        if (c.account) line += " · " + c.account;
        cadLines.push(line);
      });
      sections.push(cadLines.join("\n"));
    }
  }

  if (curated.activeGaugeProjects && curated.activeGaugeProjects.length) {
    var projLines = ["", "ACTIVE GAUGE PROJECTS:"];
    curated.activeGaugeProjects.forEach(function (p) {
      var line = "- " + p.title + " · " + (p.status || "—").replace("_", " ");
      if (p.account) line += " · " + p.account;
      if (p.due_date) line += " · due " + p.due_date;
      var latest = Array.isArray(p.status_updates) && p.status_updates[0];
      if (latest && latest.body) line += " · latest: \"" + trunc(latest.body, 100) + "\"";
      projLines.push(line);
    });
    sections.push(projLines.join("\n"));
  }

  return sections.join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────
// Pip Tier C — cross-account theme patterns.
// Renders recurring meeting themes for portfolio-level Pip context.
// ──────────────────────────────────────────────────────────────────────

// Renders cross-account theme patterns for portfolio-level Pip context.
export function renderPortfolioThemesBlock(themes) {
  if (!themes || themes.length === 0) return "";
  var significant = themes.filter(function (t) { return t.count >= 2; });
  if (significant.length === 0) return "";
  var lines = ["PORTFOLIO PATTERNS (recurring themes across accounts, last 90d):"];
  significant.slice(0, 5).forEach(function (t) {
    var accts = t.accounts.length > 0 ? " (" + t.accounts.join(", ") + ")" : "";
    lines.push("- " + t.theme + ": " + t.count + " meetings" + accts);
  });
  return lines.join("\n") + "\n\n";
}

// ──────────────────────────────────────────────────────────────────────
// Pip Tier A — portfolio state compression.
// Compress portfolio state into a short text block for Pip context.
// Used by portfolio-brief.js and (future) 1:1 meeting mode.
// ──────────────────────────────────────────────────────────────────────
export function buildPortfolioState(accounts, snapshots, projects) {
  if (!accounts || accounts.length === 0) return "";

  var TIER_ORDER = { "Major": 0, "Mid": 1, "Growth": 2 };
  var sortedAccounts = (accounts || []).slice().sort(function (a, b) {
    return ((TIER_ORDER[a.tier] != null ? TIER_ORDER[a.tier] : 3) -
            (TIER_ORDER[b.tier] != null ? TIER_ORDER[b.tier] : 3));
  });

  var atRisk   = (snapshots || []).filter(function (s) { return s.health_status === "at_risk"; });
  var watching = (snapshots || []).filter(function (s) { return s.health_status === "watching"; });
  var active   = (projects || []).filter(function (p) { return p.status === "in_progress"; });
  var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  var stuck    = (projects || []).filter(function (p) {
    if (p.status !== "in_progress") return false;
    var stages = p.tasks || [];
    return !stages.some(function (s) { return s.completed_at && s.completed_at > sevenDaysAgo; });
  });

  function sortedAccountNames(snapshotList) {
    return snapshotList
      .slice()
      .sort(function (a, b) {
        var ta = sortedAccounts.findIndex(function (x) { return x.id === a.account_id; });
        var tb = sortedAccounts.findIndex(function (x) { return x.id === b.account_id; });
        if (ta === -1) ta = 9999;
        if (tb === -1) tb = 9999;
        return ta - tb;
      })
      .map(function (s) { return findAccountName(sortedAccounts, s.account_id); });
  }

  var lines = ["PORTFOLIO STATE — " + sortedAccounts.length + " accounts"];
  if (atRisk.length)   lines.push("At Risk: " + sortedAccountNames(atRisk).join(", "));
  if (watching.length) lines.push("Watching: " + sortedAccountNames(watching).join(", "));
  if (active.length)   lines.push("Active projects: " + active.length + (stuck.length ? " (" + stuck.length + " stuck)" : ""));
  return lines.join("\n");
}

function findAccountName(accounts, id) {
  var a = accounts.find(function (x) { return x.id === id; });
  return a ? a.name : "Unknown";
}
