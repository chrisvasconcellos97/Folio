// Context curation and prose rendering for Pip.
//
// Two responsibilities:
//   1. curateContext(raw, message, focusedAccountIds) — drop irrelevant accounts
//      from the payload, OR fall back to a list-only summary view.
//   2. renderContextProse(curated) — render the curated payload as compact
//      prose (not JSON) so the model spends fewer tokens parsing structure.
//
// Both functions are pure; safe to call on either client or server.

import { computeContactEngagement } from "./contactEngagement";

// Resolve account names mentioned in the message + the prior assistant message
// (for follow-up context). Returns array of account objects, deduped.
function resolveMentionedAccounts(accounts, messageText) {
  if (!accounts || !accounts.length || !messageText) return [];
  var lower = String(messageText).toLowerCase();
  var matches = [];
  accounts.forEach(function (a) {
    if (!a || !a.name) return;
    var name = a.name.toLowerCase();
    // Full name substring match
    if (name.length >= 3 && lower.indexOf(name) !== -1) {
      matches.push(a);
      return;
    }
    // Otherwise check any distinctive word from the name (≥3 chars, not a stopword)
    var words = name.split(/\s+/).filter(function (w) {
      return w.length >= 3 && ["and", "the", "for", "auto", "inc", "llc", "corp", "ltd", "group"].indexOf(w) === -1;
    });
    var hit = words.some(function (w) {
      // Match as a whole word
      return new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(messageText);
    });
    if (hit) matches.push(a);
  });
  return matches;
}

// Cap an array to N items.
function take(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.length <= n ? arr : arr.slice(0, n);
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

// Renders a one-line health trend string from an array of snapshot rows.
// Emitted only when ≥ 3 snapshots exist and at least one status differs from the others.
// snapshots — array of folio_account_snapshots rows (any date range, already filtered to this account).
function renderHealthTrendBlock(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 3) return "";
  var sorted = snapshots.slice().sort(function (a, b) {
    return (a.snapshot_date || "") > (b.snapshot_date || "") ? 1 : -1;
  });
  var statuses = sorted.map(function (s) { return s.health_status || "unknown"; });
  // Skip if all statuses are identical — no trend to show.
  var first = statuses[0];
  if (statuses.every(function (s) { return s === first; })) return "";
  return "HEALTH TREND (last " + statuses.length + " snapshots): " + statuses.join(" → ");
}

// Renders a delivery track record block from pip_promise_log stats.
// promiseStats — { avgDays, recentItems } from usePipPromiseLog, or null.
function renderPromiseLogBlock(promiseStats) {
  if (!promiseStats || !promiseStats.avgDays || promiseStats.avgDays <= 0) return "";
  var lines = ["DELIVERY TRACK RECORD (this account):"];
  lines.push("- Average days to close a commitment: ~" + promiseStats.avgDays + "d");
  var recent = Array.isArray(promiseStats.recentItems) ? promiseStats.recentItems : [];
  if (recent.length > 0) {
    var closes = recent.slice(0, 5).map(function (r) {
      return '"' + (r.item_text || "—").slice(0, 60) + '" (' + (r.days_to_complete != null ? r.days_to_complete + "d" : "?") + ')';
    });
    lines.push("- Recent closes: " + closes.join(", "));
  }
  return lines.join("\n");
}

function renderAccountFull(a) {
  var lines = [];
  var headerSuffix = "";
  if (a.account_type && a.account_type !== "standard" && a.account_type !== "mso" && a.account_type !== "shop") {
    headerSuffix = " [" + typeLabel(a.account_type) + "]";
  } else if (a.account_type === "mso") {
    headerSuffix = " [MSO]";
  }
  lines.push("ACCOUNT: " + a.name + headerSuffix + (a.id ? " (id: " + a.id + ")" : ""));
  var status = a.status || "—";
  var health = a.health || "—";
  var last   = a.last_interaction_at ? fmtDate(a.last_interaction_at) : "never";
  var ds     = daysSince(a.last_interaction_at);
  var dsStr  = ds == null ? "" : " (" + ds + "d ago)";
  var statusLine = "Status: " + status + " · Health: " + health + " · Last contact: " + last + dsStr;
  var isCustomerType = a.account_type !== "internal_team" && a.account_type !== "partner";
  if (a.tier && isCustomerType) statusLine += " · Tier: " + a.tier;
  lines.push(statusLine);
  // Status override — surface to Pip so it can reference the manual pin in briefs.
  if (a.status_override) {
    var overrideLine = "Status override: " + a.status_override
      + (a.status_override_reason ? " (" + a.status_override_reason + ")" : "")
      + (a.status_override_at ? " — pinned " + fmtDate(a.status_override_at) : "")
      + (a.status_override_until ? ", expires " + a.status_override_until : "");
    lines.push(overrideLine);
  }
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
  if (a.serviced_states && a.serviced_states.length) {
    var ss = a.serviced_states;
    var ssStr = ss.length >= 48 ? "National (" + ss.length + " states)" : ss.length + " states: " + ss.slice(0, 10).join(", ") + (ss.length > 10 ? "…" : "");
    lines.push("Serviced states: " + ssStr);
  }
  if (a.objective) lines.push("Account Intel: " + a.objective);

  var meetings = take(a.meetings, 8);
  if (meetings.length) {
    lines.push("");
    lines.push("Recent meetings (" + meetings.length + "):");
    meetings.forEach(function (m) {
      var head = "- " + (m.date || "?") + " — \"" + (m.title || "Meeting") + "\"";
      if (m.attendees && m.attendees.length) head += " — attendees: " + m.attendees.join(", ");
      lines.push(head);
      // Prefer pip_summary; fall back to notes (truncated).
      var body = m.summary && m.summary.length > 0 ? m.summary : (m.notes ? trunc(m.notes, 200) : "");
      if (body) lines.push("  " + trunc(body, 240));
      if (m.action_items) lines.push("  Action items: " + trunc(m.action_items, 200));
      if (m.follow_up) lines.push("  Follow-up: " + m.follow_up);
      if (m.theme) lines.push("  Theme: " + m.theme);
      if (m.tone) lines.push("  Tone: " + m.tone);
    });
  }

  var items = take(a.openItems, 10);
  if (items.length) {
    lines.push("");
    lines.push("Open items (" + items.length + "):");
    var today = new Date(); today.setHours(0, 0, 0, 0);
    items.forEach(function (i) {
      var prefix = "- ";
      if (i.due) {
        var due = new Date(i.due);
        var diff = Math.round((due - today) / 86400000);
        if (diff < 0) prefix = "- [overdue " + Math.abs(diff) + "d] ";
        else if (diff <= 7) prefix = "- [due in " + diff + "d] ";
      }
      var tail = i.due ? " (due " + i.due + ")" : "";
      if (i.owner) tail += " · owner: " + i.owner;
      lines.push(prefix + (i.text || "—") + tail);
    });
  }

  // Pip Tier B — commitments section
  var allOpenItems = a.openItems || [];
  var commitments = allOpenItems.filter(function (i) { return i.is_commitment; });
  var todayStr = new Date().toISOString().slice(0, 10);
  if (commitments.length > 0) {
    lines.push("");
    lines.push("COMMITMENTS (promised deliverables, " + commitments.length + "):");
    commitments.slice(0, 5).forEach(function (c) {
      var isOverdue = c.due && c.due < todayStr;
      var due = c.due ? " (due " + c.due + (isOverdue ? " — OVERDUE" : "") + ")" : "";
      var tail = c.owner ? " · owner: " + c.owner : "";
      lines.push("- " + (c.text || "—") + due + tail);
    });
  }

  var contacts = take(a.contacts, 6);
  if (contacts.length) {
    lines.push("");
    lines.push("Contacts (" + contacts.length + "):");
    contacts.forEach(function (c) {
      var line = "- " + (c.name || "—");
      if (c.title) line += " — " + c.title;
      if (c.email) line += " — " + c.email;
      if (c.is_poc) line += " [POC]";
      lines.push(line);
    });
  }

  // Pip Tier B — cold contacts from engagement analysis
  if (contacts.length > 0 && (a.meetings || []).length > 0) {
    var engagement = computeContactEngagement(contacts, a.meetings);
    var coldContacts = contacts.filter(function (c) {
      var e = engagement[c.name];
      return e && e.daysSince !== null && e.daysSince > 30;
    });
    if (coldContacts.length > 0) {
      lines.push("");
      lines.push("CONTACTS NOT SEEN IN 30+ DAYS:");
      coldContacts.forEach(function (c) {
        var e = engagement[c.name];
        lines.push("- " + c.name + (c.title ? " (" + c.title + ")" : "") + " — last seen " + e.daysSince + " days ago");
      });
    }
  }

  var projects = take(a.activeProjects, 5);
  if (projects.length) {
    lines.push("");
    lines.push("Active projects (" + projects.length + "):");
    projects.forEach(function (p) {
      var line = "- " + p.title + " · " + (p.status || "—").replace("_", " ");
      if (p.due_date) line += " · due " + p.due_date;
      lines.push(line);
    });
  }

  // Recent account-level updates — catalog/pricing/integration changes etc.
  var recentUpdates = take(a.recentUpdates, 6);
  if (recentUpdates.length) {
    lines.push("");
    lines.push("Recent updates (" + recentUpdates.length + "):");
    recentUpdates.forEach(function (u) {
      var parts = ["- " + (u.update_date || "?")];
      if (u.update_type) parts.push(u.update_type);
      if (u.owner)       parts.push(u.owner);
      var head = parts.join(" · ") + " · " + (u.title || "—");
      if (u.observed_impact) head += " [impact: " + u.observed_impact + "]";
      lines.push(head);
      if (u.description) lines.push("  " + trunc(u.description, 200));
    });
  }

  // Health trend — trajectory across last N snapshots.
  var healthTrendLine = renderHealthTrendBlock(a.healthSnapshots);
  if (healthTrendLine) {
    lines.push("");
    lines.push(healthTrendLine);
  }

  // Snapshot metrics — numeric detail behind the health status
  var latestSnap = (a.healthSnapshots && a.healthSnapshots.length > 0)
    ? a.healthSnapshots.slice().sort(function(x,y){ return (x.snapshot_date||"") > (y.snapshot_date||"") ? -1 : 1; })[0]
    : null;
  if (latestSnap) {
    var snapParts = [];
    if (latestSnap.health_score != null) snapParts.push("Score: " + Math.round(latestSnap.health_score));
    if (latestSnap.days_since_contact != null) snapParts.push("Days since contact: " + latestSnap.days_since_contact);
    if (latestSnap.open_item_count != null) snapParts.push("Open items: " + latestSnap.open_item_count);
    if (latestSnap.overdue_count != null) snapParts.push("Overdue: " + latestSnap.overdue_count);
    if (latestSnap.active_project_count != null) snapParts.push("Active projects: " + latestSnap.active_project_count);
    if (snapParts.length) {
      lines.push("");
      lines.push("Account metrics: " + snapParts.join(" · "));
    }
  }

  // Delivery track record — promise log stats for this account.
  var promiseLogLine = renderPromiseLogBlock(a.promiseStats);
  if (promiseLogLine) {
    lines.push("");
    lines.push(promiseLogLine);
  }

  // Pip Tier C — cross-account portfolio theme patterns.
  if (a.portfolioThemes && a.portfolioThemes.length > 0) {
    lines.push("");
    lines.push(renderPortfolioThemesBlock(a.portfolioThemes).trim());
  }

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

  if (curated.mode === "list") {
    sections.push("ACCOUNTS (list view — " + curated.accounts.length + " total):");
    sections.push(curated.accounts.map(renderAccountListItem).join("\n"));
  } else if (curated.mode === "focused" && curated.accounts.length > 0) {
    curated.accounts.forEach(function (a) {
      // Phase 2: prefer the rolling cached state when it's fresh and the
      // caller did NOT mark this as a brief-mode request. Brief mode wants
      // the full raw data because that's the moment to spend tokens.
      if (a.cachedState && !curated.briefMode) {
        sections.push(renderAccountCached(a));
      } else {
        sections.push(renderAccountFull(a));
      }
    });
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
    var stages = p.stages || [];
    return !stages.some(function (s) { return s.done && s.done_at && s.done_at > sevenDaysAgo; });
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
