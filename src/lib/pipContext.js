// Context curation and prose rendering for Pip.
//
// Two responsibilities:
//   1. curateContext(raw, message, focusedAccountIds) — drop irrelevant accounts
//      from the payload, OR fall back to a list-only summary view.
//   2. renderContextProse(curated) — render the curated payload as compact
//      prose (not JSON) so the model spends fewer tokens parsing structure.
//
// Both functions are pure; safe to call on either client or server.

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
  if (a.notes) lines.push("Notes: " + trunc(a.notes, 280));

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
