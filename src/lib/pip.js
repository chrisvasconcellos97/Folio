import { supabase } from "./supabase";
import { streamPip } from "./pipStream";
import { classifyIntent } from "./pipIntent";
import { logError } from "./errorLog";
import { timed } from "./net";
import { pipBusyStart, pipBusyEnd } from "./pipBusy";

var PROXY_URL    = import.meta.env.VITE_PIP_PROXY_URL || "/api/pip";
var ASK_PIP_URL  = "/api/ask-pip";
var TIMEOUT_MS   = 30000;

function fetchWithTimeout(url, options) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .then(function (res) { clearTimeout(timer); return res; })
    .catch(function (err) { clearTimeout(timer); throw err; });
}

// Best-effort observability hook. Only fires on a *final* failure (after the
// internal 5xx retry has already had its shot) so a transient blip doesn't
// double-log. Caller's promise still rejects exactly as before.
function logPipFailure(url, status, err) {
  try {
    var msg;
    if (err && err.message) msg = err.message;
    else if (typeof status === "number") msg = "Pip proxy " + status;
    else msg = "Pip request failed";
    logError("pip", msg, {
      stack: err && err.stack,
      context: { url: url, status: status || null },
    });
  } catch (_) {}
}

function pipFetch(url, options, retried) {
  return fetchWithTimeout(url, options).then(function (res) {
    if (res.status === 429) {
      var busy = new Error("Pip is busy, try again in a moment");
      logPipFailure(url, 429, busy);
      return Promise.reject(busy);
    }
    if (res.status >= 500 && !retried) {
      // Don't log yet — let the retry decide. If the retry also fails this
      // function is called with retried=true and we'll log there.
      return pipFetch(url, options, true);
    }
    if (!res.ok) {
      var e = new Error("Pip proxy error: " + res.status);
      logPipFailure(url, res.status, e);
      throw e;
    }
    return res.json();
  }, function (err) {
    // Network / timeout / abort. The retry path only triggers on 5xx
    // responses, so any rejection here is terminal — log it.
    logPipFailure(url, null, err);
    throw err;
  });
}

function authHeaders() {
  return supabase.auth.getSession().then(function (result) {
    var token = result.data.session ? result.data.session.access_token : null;
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  });
}

// Renders the glossary block for system prompts.
function renderGlossaryBlock(glossary) {
  var entries = Array.isArray(glossary) ? glossary.filter(function (g) { return g && g.term && g.definition; }) : [];
  if (entries.length === 0) {
    return "── KNOWN TERMS (preserve verbatim where indicated) ──\n(no glossary entries yet — user can add terms in Settings → Pip's Glossary)\n\n";
  }
  var lines = entries.map(function (g) {
    var line = "- " + g.term + ": " + g.definition;
    var aliases = Array.isArray(g.aliases) ? g.aliases.filter(Boolean) : [];
    if (aliases.length) line += ". Aliases: " + aliases.join(", ") + ".";
    if (g.preserve_case !== false) line += " Preserve case exactly.";
    return line;
  }).join("\n");
  return "── KNOWN TERMS (preserve verbatim where indicated) ──\n" + lines + "\n\n";
}

// Renders the account roster block — lets Pip route new_item / new_task rows
// to accounts other than the current one when the notes mention them.
function renderAccountRosterBlock(roster, currentAccountId) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return "── YOUR ACCOUNTS ──\n(no other accounts loaded)\n\n";
  }
  // Always place the current account first so Pip knows which is "home".
  var sorted = roster.slice().sort(function (a, b) {
    if (a.id === currentAccountId) return -1;
    if (b.id === currentAccountId) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });
  var capped = sorted.slice(0, 60);
  var lines = capped.map(function (a) {
    var line = "- " + a.id + " · " + (a.name || "(unnamed)") + " (" + (a.account_type || "standard") + ")";
    var aliases = Array.isArray(a.aliases) ? a.aliases.filter(Boolean) : [];
    if (aliases.length) line += " — aliases: " + aliases.join(", ");
    return line;
  }).join("\n");
  return "── YOUR ACCOUNTS ──\n" + lines + "\n\n";
}

// Renders a compact bulleted list of correction rows for Pip's read-back.
function renderCorrectionLines(corrections) {
  var lines = (corrections || [])
    .map(function (c) {
      var orig = c.original_value || {};
      var corr = c.corrected_value || {};
      switch (c.correction_type) {
        case "rejected_row":
          return "- DECLINED a " + (orig.kind || "row") +
            " (\"" + (orig.text || orig.title || "—").slice(0, 80) + "\")" +
            (c.reason ? " — context: " + c.reason.slice(0, 120) : "");
        case "item_text_edit":
          return "- REWROTE item from \"" + (orig.original || "").slice(0, 60) +
            "\" → \"" + (corr.text || "").slice(0, 80) + "\"";
        case "task_text_edit":
          return "- REWROTE task from \"" + (orig.original || "").slice(0, 60) +
            "\" → \"" + (corr.text || "").slice(0, 80) + "\"";
        case "summary_edit":
          return "- EDITED summary: user rewrote " +
            ((corr.text || "").length < (orig.text || "").length ? "shorter" : "differently") +
            (c.reason ? " — reason: " + c.reason.slice(0, 80) : "");
        case "missed_item":
          return "- ADDED a row you missed: \"" + (corr.text || "").slice(0, 100) +
            "\" — watch for scope cues (\"all\", \"these\", \"every\", \"in general\") " +
            "that signal a broader item beyond the specific example";
        case "routed_account_changed":
          return "- ROUTED a row to a different account than I picked: \"" +
            ((orig.text || "")).slice(0, 80) +
            "\" — the user moved it to a different account. Pay closer attention to which account " +
            "names are mentioned in the notes vs the meeting's current account.";
        default:
          return "- " + c.correction_type;
      }
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "";
}

// Renders an extra instructional block injected ONLY for internal_team meetings.
function renderInternalMeetingBlock() {
  return "── INTERNAL TEAM MEETING ──\n" +
    "The current account is an internal team. Action items from these meetings are TYPICALLY " +
    "for external accounts (customers / partners), not this team itself. Look hard for external " +
    "account mentions in the notes and route accordingly via target_account_id. Items that DO " +
    "belong to the internal team look like internal coordination (\"update template\", " +
    "\"schedule team meeting\", \"review process\") — not delivery work or customer follow-ups.\n\n";
}

// Renders a block injected for person 1:1 cadences (scope='person', no current account).
function renderPersonCadenceBlock(contactName) {
  return "── PERSON 1:1 MEETING ──\n" +
    "This meeting is a leadership or peer 1:1 with " + (contactName || "a colleague") + ". " +
    "There is NO current account — this meeting is not tied to any customer. " +
    "Almost every action item discussed in a 1:1 concerns a specific customer account — look hard for " +
    "account names in the notes and route each item via target_account_id using the YOUR ACCOUNTS list. " +
    "Items that are purely internal or personal (e.g. 'schedule next 1:1', 'update my status deck') have " +
    "no account — leave target_account_id null for those only. When unsure, suggest a route (low confidence) " +
    "rather than leaving it floating — the user can reassign it.\n\n";
}

// Renders the contacts block for summarize prompts.
function renderContactsBlock(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return "";
  var lines = contacts.slice(0, 8).map(function (c) {
    var line = "- " + (c.name || "—");
    if (c.title) line += " · " + c.title;
    if (c.email) line += " · " + c.email;
    var flags = [];
    if (c.is_poc)     flags.push("POC");
    if (c.is_primary) flags.push("Primary");
    if (c.is_leader)  flags.push("Leader");
    if (flags.length) line += " [" + flags.join(", ") + "]";
    if (c.notes) line += " — " + c.notes.slice(0, 120);
    return line;
  });
  return "── CONTACTS ──\n" + lines.join("\n") + "\n\n";
}

// Renders recent meeting history (with Pip summaries) for summarize prompts.
function renderMeetingHistoryBlock(meetings) {
  if (!Array.isArray(meetings) || meetings.length === 0) return "";
  var recent = meetings.slice(0, 5);
  var lines = recent.map(function (m) {
    var head = "- " + (m.date || m.meeting_date || "?") + " — \"" + (m.title || m.pip_short_title || "Meeting") + "\"";
    if (m.attendees && m.attendees.length) head += " · attendees: " + m.attendees.join(", ");
    if (m.method) head += " · via " + m.method;
    var body = (m.pip_summary || m.notes || "").slice(0, 220);
    return head + (body ? "\n  " + body : "");
  });
  return "── RECENT MEETING HISTORY ──\n" + lines.join("\n") + "\n\n";
}

// Renders the cadence schedule block for summarize prompts.
function renderCadenceScheduleBlock(cadence) {
  if (!cadence) return "";
  var parts = [];
  if (cadence.type)      parts.push("Type: " + cadence.type);
  if (cadence.frequency) parts.push("Frequency: " + cadence.frequency);
  if (cadence.meeting_time) parts.push("Time: " + cadence.meeting_time);
  if (cadence.notes)     parts.push("Notes: " + cadence.notes.slice(0, 120));
  if (!parts.length) return "";
  return "── CADENCE SCHEDULE ──\n" + parts.join(" · ") + "\n\n";
}

// Renders the Pip facts block for summarize prompts.
function renderPipFactsBlock(facts) {
  if (!Array.isArray(facts) || facts.length === 0) return "";
  return "── THINGS PIP SHOULD REMEMBER ──\n" +
    facts.slice(0, 20).map(function (f) { return "- " + f; }).join("\n") + "\n\n";
}

// Renders the account context block for system prompts.
function renderAccountObjectiveBlock(objective) {
  var text = (objective || "").trim();
  return "── ABOUT THIS ACCOUNT (your notes) ──\n" +
    (text || "(none yet — write notes about this account in the Overview tab so Pip knows context)") +
    "\n\n";
}

// Renders a one-line health trend string from snapshot rows (for summarize context).
// snapshots — array of folio_account_snapshots rows already filtered to this account.
function renderHealthTrendBlock(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 3) return "";
  var sorted = snapshots.slice().sort(function (a, b) {
    return (a.snapshot_date || "") > (b.snapshot_date || "") ? 1 : -1;
  });
  var statuses = sorted.map(function (s) { return s.health_status || "unknown"; });
  var first = statuses[0];
  if (statuses.every(function (s) { return s === first; })) return "";
  return "HEALTH TREND (last " + statuses.length + " snapshots): " + statuses.join(" → ") + "\n\n";
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
  return lines.join("\n") + "\n\n";
}

// Renders the commitments sub-section for bp3 — tells Pip which items are already
// standing promises so it doesn't duplicate them in the plan.
// openItems — folio_tasks rows (with .text/.title, .due_date, .is_commitment, .owner).
// todayISO — "YYYY-MM-DD" string for overdue detection.
function renderCommitmentsInBlock(openItems, todayISO) {
  if (!Array.isArray(openItems) || openItems.length === 0) return "";
  var commitments = openItems.filter(function (i) { return i.is_commitment; });
  if (commitments.length === 0) return "";
  var lines = ["── STANDING COMMITMENTS ON THIS ACCOUNT (promises already made — avoid duplicating) ──"];
  commitments.slice(0, 5).forEach(function (c) {
    var label = c.text || c.title || "—";
    var due = c.due_date || c.due || null;
    var isOverdue = due && todayISO && due < todayISO;
    var duePart = due ? " (due " + due + (isOverdue ? " — OVERDUE" : "") + ")" : "";
    var ownerPart = (c.owner || c.assignee_email) ? " · owner: " + (c.owner || c.assignee_email) : "";
    lines.push("- " + label + duePart + ownerPart);
  });
  return lines.join("\n") + "\n\n";
}

// Re-export so callers (PipView) can short-circuit deterministic answers.
export { classifyIntent };

/**
 * Chat-mode entry point used by PipView. Runs intent classification first,
 * then either returns a deterministic answer immediately or hits the model.
 *
 * @param {Array} messages - conversation history ({role, content})
 * @param {Object} context - raw context object (accounts/items/etc)
 * @param {Object} [opts]  - { mode?, focusedAccountIds?, onDelta?, onToolUse?, stream?, facts? }
 * @returns Promise<{ content, toolCalls, meta, deterministic? }>
 */
export function askPip(messages, context, opts) {
  opts = opts || {};
  var lastUser = "";
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUser = messages[i].content || messages[i].text || ""; break; }
  }
  // Only auto-classify when no explicit mode is provided.
  if (!opts.mode) {
    var intent = classifyIntent(lastUser, context);
    if (intent.deterministicAnswer) {
      return Promise.resolve({
        content: intent.deterministicAnswer,
        toolCalls: [],
        deterministic: true,
        meta: { mode: "deterministic" },
      });
    }
    opts.mode = intent.mode;
  }
  return callPipApi(messages, context, opts);
}

/**
 * Lower-level entry — direct call without intent routing. Used by Brief Me /
 * Ask-Pip-on-meeting where the caller already knows the mode and focused
 * accounts.
 */
export function callPipApi(messages, context, opts) {
  opts = opts || {};
  var body = {
    messages: messages,
    context:  context || {},
    mode:     opts.mode || "chat",
    stream:   opts.stream !== false && (typeof opts.onDelta === "function" || typeof opts.onToolUse === "function"),
  };
  if (opts.focusedAccountIds && opts.focusedAccountIds.length) {
    body.focusedAccountIds = opts.focusedAccountIds;
  }
  if (opts.facts && opts.facts.length) {
    body.facts = opts.facts;
  }
  // Gauge V3 — pass the user's lens so api/pip.js can frame Pip per-view.
  if (opts.lens) {
    body.lens = opts.lens;
  }
  // summary-mode structured caching — passes pre-built content blocks and
  // static system blocks so api/pip.js can apply cache_control at each layer.
  if (opts.summarySystemBlocks && opts.summarySystemBlocks.length) {
    body.summarySystemBlocks = opts.summarySystemBlocks;
  }
  if (opts.userContentBlocks && opts.userContentBlocks.length) {
    body.userContentBlocks = opts.userContentBlocks;
  }
  pipBusyStart();
  return timed("pip." + (opts.mode || "chat"), function () {
    return authHeaders().then(function (headers) {
      if (body.stream) {
        return streamPip(PROXY_URL, body, headers, opts.onDelta, opts.onToolUse).then(function (r) {
          // Normalize shape — always expose toolCalls (default []).
          return { content: r.content || "", toolCalls: r.toolCalls || [], meta: r.meta || null };
        }, function (err) {
          // streamPip rejections are terminal — log them like pipFetch does.
          try {
            logError("pip", (err && err.message) || "Pip stream failed", {
              stack: err && err.stack,
              context: { url: PROXY_URL, mode: opts.mode || "chat", stream: true },
            });
          } catch (_) {}
          throw err;
        });
      }
      return pipFetch(PROXY_URL, {
        method: "POST",
        headers: headers,
        body:    JSON.stringify(body),
      }).then(function (j) {
        return { content: j.content || "", toolCalls: j.tool_calls || [], meta: j.meta || null };
      });
    });
  }).then(function (out) { pipBusyEnd(); return out; }, function (err) { pipBusyEnd(); throw err; });
}

// --- Brief Me & Ask-Pip-on-meeting --------------------------------------

/**
 * Brief Me — generates a pre-call brief for an account. Uses Sonnet for
 * better synthesis. Routes through /api/pip with mode: "brief" + focused
 * account id, so the prose context only includes that account.
 *
 * Payload shape mirrors what AccountDetail.jsx passes today, so the existing
 * caller doesn't need to change its body shape.
 */
export function callBriefMePip(payload) {
  // Translate the existing ask-pip payload into pip-format inputs.
  var account = payload.account || {};
  var meetings = payload.meetings || [];
  var openItems = payload.openItems || [];
  var contacts = payload.contacts || [];
  var recentDeliveries = payload.recentDeliveries || [];
  var activeProjects = payload.activeProjects || [];
  var accountObjective = (payload.accountObjective != null ? payload.accountObjective : account.objective) || "";
  var glossary = Array.isArray(payload.glossary) ? payload.glossary : [];

  var context = {
    accounts: [{
      id:     account.id,
      name:   account.name,
      status: account.status,
      tier:   account.tier,
      health: account.health,
      account_type: account.account_type || "standard",
      agreement_end_date: account.agreement_end_date || null,
      scope_summary: account.scope_summary || null,
      billing_terms: account.billing_terms || null,
      spend_ytd: account.spend_ytd != null ? account.spend_ytd : null,
      last_interaction_at: account.last_interaction_at,
      notes:  account.objective,
      tags:   account.tags,
      region: account.region,
      meetings: meetings.map(function (m) {
        return {
          date: m.meeting_date, title: m.title, notes: m.notes,
          action_items: m.action_items, commitments: m.commitments,
          follow_up: m.follow_up_date, summary: m.pip_summary,
          attendees: m.attendees,
        };
      }),
      openItems: openItems.map(function (i) {
        return { text: i.text, due: i.due_date, owner: i.owner };
      }),
      contacts: contacts.map(function (c) {
        return { name: c.name, title: c.title, email: c.email, is_poc: c.is_poc };
      }),
      activeProjects: activeProjects.map(function (p) {
        return { title: p.title, status: p.status, due_date: p.due_date };
      }),
    }],
    recentDeliveries: recentDeliveries,
  };

  var userMsg =
    renderGlossaryBlock(glossary) +
    renderAccountObjectiveBlock(accountObjective) +
    "Give me a pre-call brief for **" + (account.name || "this account") + "**.";

  return callPipApi(
    [{ role: "user", content: userMsg }],
    context,
    { mode: "brief", focusedAccountIds: account.id ? [account.id] : null }
  ).then(function (resp) {
    // Keep the legacy { brief: "..." } shape for the existing caller.
    return { brief: resp.content || "" };
  });
}

/**
 * Ask-Pip-on-meeting — generates a summary + follow-up email for one
 * meeting. We pick "summary" mode (Sonnet, 1024 tokens) since the summary is
 * the headline output. The email is asked for in the same call to save a
 * round trip; the model returns valid JSON we parse client-side.
 */
export function callAskPip(payload) {
  if (payload.mode !== "meeting") {
    // Fallback for any other legacy callers — keep old behaviour via ask-pip.
    return supabase.auth.getSession().then(function (result) {
      var token = result.data.session ? result.data.session.access_token : null;
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return pipFetch(ASK_PIP_URL, {
        method: "POST",
        headers: headers,
        body:    JSON.stringify(payload),
      });
    });
  }

  var m = payload.meeting || {};
  var glossary = Array.isArray(payload.glossary) ? payload.glossary : [];
  var accountObjective = (payload.accountObjective || "").trim();
  var prompt =
    renderGlossaryBlock(glossary) +
    renderAccountObjectiveBlock(accountObjective) +
    "Summarize this meeting, extract action items aggressively, and draft a follow-up email. " +
    "Return ONLY valid JSON: {\"summary\":\"...\",\"action_items\":[\"...\"],\"email\":\"...\"}.\n\n" +
    "Account: " + (payload.accountName || "—") + "\n" +
    "Meeting: " + (m.title || "Untitled") + " (" + (m.meeting_date || "") + ")\n" +
    (m.notes          ? "Notes: " + m.notes + "\n" : "") +
    (m.talking_points ? "Talking points: " + m.talking_points + "\n" : "") +
    (m.action_items   ? "Existing action items: " + m.action_items + "\n" : "") +
    (m.commitments    ? "Commitments: " + m.commitments + "\n" : "") +
    "\nSummary: 2-3 sentences capturing what was discussed.\n" +
    "action_items: Be GENEROUS, not strict. Include ANY of the following you can find or reasonably infer from the notes:\n" +
    "  - tasks Chris committed to (send, follow up, draft, prepare, call, schedule, etc.)\n" +
    "  - commitments the other party made (they will send X, get back on Y)\n" +
    "  - open questions or unresolved items mentioned\n" +
    "  - 'next time' / 'next meeting' references\n" +
    "  - things to verify, confirm, or check on\n" +
    "Each item is one short plain string (no bullets, no numbering, no 'TODO:' prefix). " +
    "If existing action items are listed above, include all of them in your output plus anything new — don't lose them. " +
    "If after a careful read you truly find zero, return an empty array — but try hard first.\n" +
    "email: Body only (no subject, plain prose, friendly professional tone).";

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "summary" }
  ).then(function (resp) {
    var text = resp.content || "";
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) return { summary: text, email: "", action_items: "" };
    try {
      var parsed = JSON.parse(match[0]);
      var items  = Array.isArray(parsed.action_items)
        ? parsed.action_items.filter(function (x) { return typeof x === "string" && x.trim(); }).join("\n")
        : (typeof parsed.action_items === "string" ? parsed.action_items : "");
      return {
        summary:      parsed.summary || "",
        email:        parsed.email || "",
        action_items: items,
      };
    } catch (e) {
      return { summary: text, email: "", action_items: "" };
    }
  });
}

/**
 * Summarize a conversation draft. Returns a structured plan: summary,
 * follow_up_date, plus a `plan` array describing each intended mutation
 * against existing folio_tasks + Gauge project tasks. Callers must run the plan
 * through PipSummarizePreview before applying.
 *
 * Backwards-compat: if Pip returns the old flat shape (summary +
 * action_items[]), we synthesize a plan of new_item rows so the preview
 * still renders something meaningful.
 *
 * @param {Object} payload
 * @param {Object} payload.draft             - the meeting/draft object
 * @param {string} payload.accountName       - parent account name
 * @param {string} payload.cadenceLabel      - cadence label for context
 * @param {string} [payload.accountId]       - the account id (for hints)
 * @param {Array}  [payload.existingItems]   - open folio_tasks on the account (action items)
 * @param {Array}  [payload.activeProjects]  - gauge projects (with .stages tasks)
 * @param {Array}  [payload.orgMembers]      - org members (for assignee options)
 * @param {Array}  [payload.assignmentHints] - learned hints rows
 * @param {string} [payload.accountObjective]  - account context / notes for Pip
 * @param {Array}  [payload.glossary]          - known terms to inject
 * @param {Array}  [payload.accountRoster]     - full list of user's accounts for cross-routing
 * @param {string} [payload.accountType]       - account_type of the current account
 * @param {Object} [payload.pipAccountState]   - { lessons_learned, last_compression_at } row
 */
export function summarizeDraftPip(payload) {
  var m              = payload.draft || {};
  var existingItems  = Array.isArray(payload.existingItems)  ? payload.existingItems  : [];
  var activeProjects = Array.isArray(payload.activeProjects) ? payload.activeProjects : [];
  var orgMembers     = Array.isArray(payload.orgMembers)     ? payload.orgMembers     : [];
  var hints          = Array.isArray(payload.assignmentHints) ? payload.assignmentHints : [];
  var corrections    = Array.isArray(payload.corrections)     ? payload.corrections     : [];
  var accountObjective = (payload.accountObjective || "").trim();
  var glossary         = Array.isArray(payload.glossary) ? payload.glossary : [];
  var accountRoster    = Array.isArray(payload.accountRoster) ? payload.accountRoster : [];
  var accountType      = payload.accountType || "standard";
  var pipAccountState  = payload.pipAccountState || null;
  var isPersonCadence  = !!payload.isPersonCadence;
  var contactName      = payload.contactName || null;
  var contacts         = Array.isArray(payload.contacts)       ? payload.contacts       : [];
  var meetingHistory   = Array.isArray(payload.meetingHistory) ? payload.meetingHistory : [];
  var cadence          = payload.cadence        || null;
  var facts            = Array.isArray(payload.facts)          ? payload.facts          : [];
  var healthSnapshots  = Array.isArray(payload.healthSnapshots) ? payload.healthSnapshots : [];
  var promiseStats     = payload.promiseStats  || null;
  var openItems        = Array.isArray(payload.openItems)       ? payload.openItems       : existingItems;

  // #5 — skip Pip on trivial drafts (< 100 chars of notes + action_items).
  // Returns immediately with an empty plan so the caller still shows the
  // preview modal; the user can add rows manually via "+ Add an item".
  var noteLen = ((m.notes || "") + (m.action_items || "")).trim().length;
  if (noteLen < 100) {
    return Promise.resolve({
      summary:        (m.notes || "").trim() || "(no notes)",
      short_title:    m.title || "Conversation",
      follow_up_date: null,
      tone:           null,
      plan:           [],
      action_items:   [],
      skippedByPip:   true,
    });
  }

  var itemLines = existingItems.length
    ? existingItems.map(function (i) {
        return "I-" + i.id + ": " + (i.text || "(no text)") + ", due " + (i.due_date || "—");
      }).join("\n")
    : "(none)";

  var taskLines = [];
  activeProjects.forEach(function (p) {
    var stages = Array.isArray(p.stages) ? p.stages : [];
    stages.forEach(function (t) {
      if (t && !t.completed_at) {
        var title = t.title || t.text || "(untitled)";
        taskLines.push(
          "T-" + t.id + " (" + (p.title || "Untitled project") + "): " + title +
          ", status " + (t.task_status || t.status || "—") +
          ", due " + (t.due_date || "—") +
          ", project_id " + p.id
        );
      }
    });
  });
  var taskBlock = taskLines.length ? taskLines.join("\n") : "(none)";

  var memberLines = orgMembers.length
    ? orgMembers.map(function (mb) {
        return "- " + (mb.invited_email || mb.email || "(unknown)");
      }).join("\n")
    : "(none — leave suggested_assignee null)";

  var hintLines = hints.length
    ? hints.map(function (h) {
        return "- tasks like \"" + h.task_pattern + "\" → " + h.assignee_email;
      }).join("\n")
    : "(no hints yet)";

  // #2 — V2 brain correction context. Prefer compressed lessons_learned (fresher
  // than 14 days) over raw corrections. If both exist but lessons_learned > 14d,
  // include both so Pip gets institutional memory + recent signal.
  var correctionBlock;
  var lessonsLearned = pipAccountState && pipAccountState.lessons_learned ? pipAccountState.lessons_learned.trim() : "";
  var lastCompAt     = pipAccountState && pipAccountState.last_compression_at
    ? new Date(pipAccountState.last_compression_at).getTime()
    : 0;
  var compAgeMs      = lastCompAt ? Date.now() - lastCompAt : Infinity;
  var FOURTEEN_DAYS  = 14 * 24 * 60 * 60 * 1000;

  if (lessonsLearned && compAgeMs <= FOURTEEN_DAYS) {
    correctionBlock = "── PATTERNS PIP HAS LEARNED ABOUT THIS ACCOUNT ──\n" + lessonsLearned + "\n\n";
  } else if (lessonsLearned) {
    var recentCorrLines = renderCorrectionLines(corrections.slice(0, 3));
    correctionBlock =
      "── PATTERNS PIP HAS LEARNED ──\n" + lessonsLearned + "\n\n" +
      "── RECENT CORRECTIONS (last 3) ──\n" + (recentCorrLines || "(none)") + "\n\n";
  } else {
    var rawCorrLines = renderCorrectionLines(corrections.slice(0, 10));
    correctionBlock =
      "Things the user has corrected before — STUDY these and don't repeat the same misreads. " +
      "If the pattern matches the current notes, route accordingly (decline merges that were " +
      "declined before, prefer wording the user has rewritten to, etc):\n" +
      (rawCorrLines || "(no prior corrections — first time on this account)") + "\n\n";
  }

  // ── Structured content blocks with cache breakpoints ────────────────────
  //
  // Block layout for stacked caching (up to 4 breakpoints):
  //   BP1 (system)  — static schema/rules  — cached globally across all calls
  //   BP2 (user)    — glossary + org members  — stable per user for hours
  //   BP3 (user)    — account roster + objective + learned patterns  — stable per account
  //   BP4 (user)    — existing items + tasks + projects + hints  — changes per meeting
  //   (no marker)   — CONTEXT header + NOTES  — varies every call
  //
  // Everything marked cache_control is the TAIL of that layer — Anthropic
  // caches all content up to and including the marked block.

  // BP1 — static schema + rules (sent as summarySystemBlocks to api/pip.js)
  var SUMMARIZE_SCHEMA_RULES =
    "You are planning post-meeting bookkeeping. Compare the meeting notes against the user's " +
    "existing open items and existing in-flight Gauge tasks. Return a structured plan that " +
    "AVOIDS duplicates and prefers updates/closes over new rows.\n\n" +
    "Return ONLY valid JSON with this exact shape (no preamble, no markdown):\n" +
    "{\n" +
    "  \"short_title\": \"3-4 word email-subject-style label, Title Case (e.g. 'Q3 Forecast Prep', 'Dan Integration Request'). Never include date or account name.\",\n" +
    "  \"summary\": \"2-3 sentence summary\",\n" +
    "  \"follow_up_date\": \"YYYY-MM-DD or null\",\n" +
    "  \"tone\": \"positive|neutral|mixed|negative — based on the meeting's overall energy. Customer pushback or blocker frustration = negative. Smooth check-in with no issues = neutral or positive. Both positive progress and some friction = mixed.\",\n" +
    "  \"plan\": [\n" +
    "    { \"kind\": \"new_item\",    \"text\": \"...\", \"due_date\": \"YYYY-MM-DD or null\", \"suggested_assignee\": \"email or null\", \"target_account_id\": \"id from YOUR ACCOUNTS list, or null if this belongs to the current account\", \"confidence\": \"high|medium|low\", \"source_excerpt\": \"verbatim 1-3 line slice of the draft notes that triggered this row\", \"is_commitment\": true },\n" +
    "    { \"kind\": \"update_item\", \"target_id\": \"I-...\", \"fields\": { \"due_date\": \"...\", \"text\": \"...\" }, \"confidence\": \"high|medium|low\", \"source_excerpt\": \"verbatim slice from notes\" },\n" +
    "    { \"kind\": \"close_item\",  \"target_id\": \"I-...\", \"reason\": \"...\", \"confidence\": \"high|medium|low\", \"source_excerpt\": \"verbatim slice from notes\" },\n" +
    "    { \"kind\": \"new_task\",    \"project_id\": \"uuid\", \"title\": \"...\", \"due_date\": \"YYYY-MM-DD or null\", \"suggested_assignee\": \"email or null\", \"target_account_id\": \"id or null\", \"confidence\": \"high|medium|low\", \"source_excerpt\": \"verbatim slice from notes\", \"is_commitment\": false },\n" +
    "    { \"kind\": \"update_task\", \"project_id\": \"uuid\", \"task_id\": \"T-...\", \"fields\": { \"due_date\": \"...\", \"task_status\": \"...\" }, \"confidence\": \"high|medium|low\", \"source_excerpt\": \"verbatim slice from notes\" },\n" +
    "    { \"kind\": \"skip\",        \"reason\": \"duplicate of T-... or I-...\", \"confidence\": \"high\" }\n" +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- If the notes mention something that already exists as an open item or in-flight task, " +
    "PREFER update_item / update_task with shifted dates over creating new ones. If it sounds " +
    "done, use close_item.\n" +
    "- If something looks like a duplicate but you can't tell, emit a `skip` row with the reason " +
    "so the user can see your reasoning.\n" +
    "- For new_item vs new_task: pick new_task only when it clearly belongs to one of the listed " +
    "Gauge projects. Otherwise default to new_item.\n" +
    "- target_id MUST be the literal id including the I- or T- prefix from the lists below.\n" +
    "- project_id is the UUID from the project list (the value after `project_id ` in the task lines, " +
    "or the leading id of an active project).\n" +
    "- suggested_assignee MUST be one of the listed org member emails or null. Use the assignment " +
    "hints to default to historically correct people for similar tasks.\n" +
    "- confidence: high = obvious from the notes, medium = a reasonable inference, low = stretching.\n" +
    "- source_excerpt MUST be a direct, verbatim quote from the draft notes — the specific 1-3 lines " +
    "that prompted this row. The user uses these to trace where each row came from and to correct " +
    "you when you misread. Keep them short and exact. Omit only for `skip` rows.\n" +
    "- Be GENEROUS extracting commitments — promises, follow-ups, things to verify — but route " +
    "them as updates whenever a relevant existing item/task exists.\n" +
    "- Watch for SCOPE CUES — phrases like \"all of these\", \"every\", \"these accounts\", " +
    "\"in general\", \"across the board\" signal a BROADER item that lives alongside any " +
    "specific example. When you see one, emit BOTH the specific item AND the broader item. " +
    "Don't collapse them into just the specific case.\n" +
    "- Match account names mentioned in notes against YOUR ACCOUNTS above (whole-word matches, " +
    "prefer capitalized proper nouns; glossary aliases are valid matches). If an item is about " +
    "another account, set target_account_id to that account's id. If unsure or ambiguous " +
    "(multiple accounts with similar names), leave target_account_id null AND set confidence " +
    "to 'low' so the user can pick.\n" +
    "- target_account_id = null means \"the current account\" (the one this meeting belongs to).\n" +
    "- Don't aggressively route — when an item is clearly about the current account or no other " +
    "account is mentioned, leave target_account_id null.\n" +
    "- is_commitment: set true when this row represents a first-person promise or deliverable you are committing to — language like \"I'll get you...\", \"we'll have X by...\", \"I'll follow up on...\", \"we'll send...\", \"I'll loop in...\". Default false for tasks, observations, or things the customer will do.\n";

  // BP1 — system: static schema + rules, cached globally
  var summarySystemBlocks = [
    { type: "text", text: SUMMARIZE_SCHEMA_RULES, cache_control: { type: "ephemeral" } },
  ];

  // BP2 — pip facts + glossary + org members (stable per user, changes infrequently)
  var bp2Text = renderPipFactsBlock(facts) + renderGlossaryBlock(glossary) + "Org members (valid assignee emails):\n" + memberLines;

  // BP3 — account roster + objective + contacts + cadence + learned patterns (stable per account)
  var todayISOForCommitments = new Date().toISOString().slice(0, 10);
  var bp3Text =
    renderAccountRosterBlock(accountRoster, payload.accountId || null) +
    (isPersonCadence ? renderPersonCadenceBlock(contactName) : (accountType === "internal_team" ? renderInternalMeetingBlock() : "")) +
    renderAccountObjectiveBlock(accountObjective) +
    renderHealthTrendBlock(healthSnapshots) +
    renderContactsBlock(contacts) +
    renderCadenceScheduleBlock(cadence) +
    renderCommitmentsInBlock(openItems, todayISOForCommitments) +
    renderPromiseLogBlock(promiseStats) +
    correctionBlock;

  // BP4 — meeting history + existing items + tasks + projects + hints (changes per meeting session)
  var bp4Text =
    renderMeetingHistoryBlock(meetingHistory) +
    "Existing open items on this account:\n" + itemLines + "\n\n" +
    "Existing in-flight Gauge tasks on this account (incl. child accounts):\n" + taskBlock + "\n\n" +
    "Active Gauge projects (use these ids for project_id):\n" +
    (activeProjects.length
      ? activeProjects.map(function (p) { return "- " + p.id + " · " + (p.title || "Untitled"); }).join("\n")
      : "(none)") + "\n\n" +
    "Assignment hints (historical overrides on this account):\n" + hintLines;

  // Variable tail — CONTEXT + NOTES, different every call, no cache marker
  var tailText =
    "\n\n── CONTEXT ──\n" +
    "Account: " + (payload.accountName || "—") + "\n" +
    "Cadence: " + (payload.cadenceLabel || "—") + "\n" +
    "Method: "  + (m.method || "—") + "\n" +
    "Date: "    + (m.meeting_date || "") + "\n" +
    "Title: "   + (m.title || "Conversation") + "\n\n" +
    "── NOTES ──\n" +
    (m.notes        ? m.notes + "\n" : "(empty)\n") +
    (m.action_items ? "\nExtra action notes: " + m.action_items + "\n" : "") +
    (m.commitments  ? "Commitments: " + m.commitments + "\n" : "");

  // Assemble user content blocks with cache_control on stable tails
  var userContentBlocks = [
    { type: "text", text: bp2Text, cache_control: { type: "ephemeral" } },
    { type: "text", text: bp3Text, cache_control: { type: "ephemeral" } },
    { type: "text", text: bp4Text, cache_control: { type: "ephemeral" } },
    { type: "text", text: tailText },
  ];

  return callPipApi(
    [{ role: "user", content: tailText }],
    null,
    { mode: "summary", summarySystemBlocks: summarySystemBlocks, userContentBlocks: userContentBlocks }
  ).then(function (resp) {
    var text = resp.content || "";
    var match = text.match(/\{[\s\S]*\}/);

    // Detect a truncated / unparseable response. If the model returned a
    // long body but we can't extract clean JSON, treat as an error rather
    // than silently returning an empty plan — silent empties make the
    // user think Pip "found nothing" when really the response got cut off.
    function looksTruncated(t) {
      if (!t) return false;
      if (t.length < 200) return false;  // short → genuine "nothing" is plausible
      var openBraces = (t.match(/\{/g) || []).length;
      var closeBraces = (t.match(/\}/g) || []).length;
      return openBraces > closeBraces;
    }

    if (!match) {
      if (looksTruncated(text)) {
        throw new Error("Pip's response got cut off mid-way (likely too many tasks). Try again — token limit was bumped.");
      }
      return { summary: text, short_title: "", plan: [], action_items: [], follow_up_date: null, tone: null };
    }
    try {
      var parsed = JSON.parse(match[0]);
      var planRaw = Array.isArray(parsed.plan) ? parsed.plan : null;
      var follow  = parsed.follow_up_date || null;
      var summary = parsed.summary || "";
      var shortTitle = (parsed.short_title && typeof parsed.short_title === "string")
        ? String(parsed.short_title).trim().slice(0, 60)
        : "";
      var tone = ["positive", "neutral", "mixed", "negative"].indexOf(parsed.tone) >= 0
        ? parsed.tone : null;

      if (planRaw) {
        var plan = planRaw.map(normalizePlanRow).filter(Boolean);
        return {
          summary:        summary,
          short_title:    shortTitle,
          follow_up_date: follow,
          tone:           tone,
          plan:           plan,
          // Keep legacy field populated from new_item rows for any caller
          // that hasn't migrated yet.
          action_items:   plan
            .filter(function (r) { return r.kind === "new_item"; })
            .map(function (r) { return { text: r.text, promised_date: r.due_date || null }; }),
        };
      }

      // Old-shape fallback — synthesize new_item plan rows.
      var legacyItems = Array.isArray(parsed.action_items) ? parsed.action_items : [];
      var synthPlan = legacyItems
        .map(function (ai) {
          if (!ai) return null;
          if (typeof ai === "string") return { kind: "new_item", text: ai, due_date: null, suggested_assignee: null, confidence: "medium" };
          return {
            kind: "new_item",
            text: ai.text || "",
            due_date: ai.promised_date || ai.due_date || null,
            suggested_assignee: null,
            confidence: "medium",
          };
        })
        .filter(function (r) { return r && r.text; });
      return {
        summary:        summary,
        short_title:    shortTitle,
        follow_up_date: follow,
        tone:           tone,
        plan:           synthPlan,
        action_items:   legacyItems,
      };
    } catch (e) {
      // JSON.parse failed mid-payload. If the response looks truncated,
      // surface the real reason rather than a silent empty plan.
      if (looksTruncated(text)) {
        throw new Error("Pip's response got cut off mid-way (likely too many tasks). Try again — token limit was bumped.");
      }
      if (typeof window !== "undefined" && window.console) {
        window.console.warn("[summarizeDraftPip] JSON parse failed:", e && e.message);
      }
      return { summary: text, short_title: "", plan: [], action_items: [], follow_up_date: null, tone: null };
    }
  });
}

function normalizePlanRow(r) {
  if (!r || typeof r !== "object" || !r.kind) return null;
  var conf = r.confidence === "high" || r.confidence === "medium" || r.confidence === "low" ? r.confidence : "medium";
  var out  = { kind: r.kind, confidence: conf };
  if (r.source_excerpt && typeof r.source_excerpt === "string") {
    out.source_excerpt = r.source_excerpt.trim();
  }
  switch (r.kind) {
    case "new_item":
      if (!r.text) return null;
      out.text = String(r.text);
      out.due_date = r.due_date || null;
      out.suggested_assignee = r.suggested_assignee || null;
      if (r.target_account_id && typeof r.target_account_id === "string" && r.target_account_id.trim()) {
        out.target_account_id = r.target_account_id.trim();
      }
      return out;
    case "update_item":
      if (!r.target_id) return null;
      out.target_id = stripIdPrefix(r.target_id, "I-");
      out.fields = sanitizeFields(r.fields, ["text", "due_date"]);
      if (!Object.keys(out.fields).length) return null;
      return out;
    case "close_item":
      if (!r.target_id) return null;
      out.target_id = stripIdPrefix(r.target_id, "I-");
      out.reason = r.reason || "";
      return out;
    case "new_task":
      if (!r.project_id || !r.title) return null;
      out.project_id = String(r.project_id);
      out.title = String(r.title);
      out.due_date = r.due_date || null;
      out.suggested_assignee = r.suggested_assignee || null;
      if (r.target_account_id && typeof r.target_account_id === "string" && r.target_account_id.trim()) {
        out.target_account_id = r.target_account_id.trim();
      }
      return out;
    case "update_task":
      if (!r.project_id || !r.task_id) return null;
      out.project_id = String(r.project_id);
      out.task_id = stripIdPrefix(r.task_id, "T-");
      out.fields = sanitizeFields(r.fields, ["due_date", "task_status", "title"]);
      if (!Object.keys(out.fields).length) return null;
      return out;
    case "skip":
      out.reason = r.reason || "duplicate";
      return out;
    default:
      return null;
  }
}

function stripIdPrefix(id, prefix) {
  var s = String(id);
  return s.indexOf(prefix) === 0 ? s.slice(prefix.length) : s;
}

function sanitizeFields(fields, allowed) {
  var out = {};
  if (!fields || typeof fields !== "object") return out;
  allowed.forEach(function (k) {
    if (fields[k] !== undefined && fields[k] !== null && fields[k] !== "") out[k] = fields[k];
  });
  return out;
}

/**
 * Generate a per-cadence Pip brief. Caller passes cadence + account + recent
 * meeting history filtered to this cadence, plus open items.
 */
export function callCadenceBriefPip(payload) {
  var cadence          = payload.cadence          || {};
  var account          = payload.account          || {};
  var meetings         = payload.meetings         || [];
  var openItems        = payload.openItems        || [];
  var activeProjects   = payload.activeProjects   || [];
  var accountObjective = (payload.accountObjective || "").trim();
  var glossary         = Array.isArray(payload.glossary) ? payload.glossary : [];

  var projectLines = activeProjects.slice(0, 6).map(function (p) {
    var bits = [];
    bits.push((p.status || "").replace("_", " "));
    if (p.due_date) bits.push("due " + p.due_date);
    var owner = p._childAccountName ? " — for " + p._childAccountName : "";
    return "- " + (p.title || "Untitled") + " (" + bits.join(" · ") + ")" + owner;
  }).join("\n");

  var prompt =
    renderGlossaryBlock(glossary) +
    renderAccountObjectiveBlock(accountObjective) +
    "Give me a short per-cadence brief.\n\n" +
    "Cadence label: " + (payload.cadenceLabel || "cadence") + "\n" +
    "Account: " + (account.name || "—") + "\n" +
    "Recent conversations:\n" +
    (meetings.length === 0 ? "(none yet)\n" : meetings.slice(0, 4).map(function (m) {
      return "- " + (m.meeting_date || "") + " " + (m.title || "") + (m.pip_summary ? " — " + m.pip_summary : (m.notes ? " — " + m.notes.slice(0, 200) : ""));
    }).join("\n") + "\n") +
    "Open items: " + (openItems.length === 0 ? "none" : openItems.map(function (i) { return i.text; }).slice(0, 5).join("; ")) + "\n" +
    "Active Gauge projects on this account:\n" +
    (projectLines || "(none)") + "\n\n" +
    "Two short paragraphs: (1) where this cadence stands and what's open " +
    "(if there's an active Gauge project, name it and call out its status — " +
    "especially if it's blocked, planning, or due soon), (2) one sharp thing " +
    "to keep in mind for the next conversation.";

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "brief", focusedAccountIds: account.id ? [account.id] : null }
  ).then(function (resp) {
    return { brief: resp.content || "" };
  });
}

/**
 * Lightweight extractor for the quick email-touchpoint flow. Takes a
 * short free-form note + the account's contacts + org members and asks
 * Pip to pull out any action items the user committed to or implied.
 * Returns { items: [{ text, due_date, suggested_assignee, confidence }] }.
 *
 * Tuned for speed and cheap inference: small prompt, JSON-only output,
 * Haiku model. ~$0.003 per call. The user reviews + edits results
 * inline before they ever hit the DB — Pip proposes, never writes.
 */
export function extractTouchpointActionsPip(payload) {
  var note          = (payload.note || "").trim();
  var accountName   = payload.accountName || "the account";
  var contactNames  = (payload.contacts || []).map(function (c) { return c.name; }).filter(Boolean);
  var orgMembers    = (payload.orgMembers || []).map(function (m) { return m.email || m.invited_email; }).filter(Boolean);
  var today         = new Date().toISOString().slice(0, 10);

  if (note.length < 6) return Promise.resolve({ items: [] });

  var prompt =
    "Read this short email/touchpoint note about a customer. Do two things:\n" +
    "1. Write a 3-4 word label for this touchpoint that reads like an email " +
    "subject line (e.g. 'Dan integration request', 'Pricing pushback', 'Q3 forecast prep'). " +
    "Title Case. Never include the date or the account name — both are shown elsewhere. " +
    "Always return one even if the note is short.\n" +
    "2. Extract any action items the user committed to or implied. Be conservative — only " +
    "list things that are clearly actionable. Return [] if nothing is actionable.\n\n" +
    "For each action item return JSON with:\n" +
    "  text                — the action in one short sentence (imperative voice)\n" +
    "  due_date            — ISO date if the note implies one (today=" + today + ", words like 'Tuesday', 'EOW', 'next week' should be resolved), else null\n" +
    "  suggested_assignee  — email of an org member if the note clearly names them; otherwise null\n" +
    "  confidence          — \"high\" | \"medium\" | \"low\"\n\n" +
    "Account: " + accountName + "\n" +
    "Customer contacts: " + (contactNames.join(", ") || "none on file") + "\n" +
    "Org members (use exact email if assignable): " + (orgMembers.join(", ") || "none") + "\n" +
    "Today: " + today + "\n\n" +
    "── NOTE ──\n" + note + "\n\n" +
    "Return ONLY valid JSON: { \"short_title\": \"...\", \"items\": [...] }";

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "summary" }
  ).then(function (resp) {
    var text = resp.content || "";
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) return { short_title: "", items: [] };
    try {
      var parsed = JSON.parse(match[0]);
      var raw    = Array.isArray(parsed.items) ? parsed.items : [];
      var items  = raw.map(function (r) {
        if (!r || typeof r.text !== "string" || !r.text.trim()) return null;
        return {
          text:                String(r.text).trim(),
          due_date:            r.due_date && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date) ? r.due_date : null,
          suggested_assignee:  r.suggested_assignee && orgMembers.indexOf(r.suggested_assignee) >= 0 ? r.suggested_assignee : null,
          confidence:          r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium",
        };
      }).filter(Boolean);
      var shortTitle = (parsed.short_title && typeof parsed.short_title === "string")
        ? String(parsed.short_title).trim().slice(0, 60)
        : "";
      return { short_title: shortTitle, items: items };
    } catch (e) {
      return { short_title: "", items: [] };
    }
  }).catch(function () {
    return { short_title: "", items: [] };
  });
}

/**
 * Compression pass for the V2 brain. Distills a batch of correction rows
 * into a stable 2-4 sentence "lessons learned" paragraph Pip reads on every
 * summarize call. Uses Haiku (summary mode = cheap). Returns the paragraph
 * string (may be empty if no clear patterns exist).
 *
 * @param {Object} payload
 * @param {Array}  payload.corrections     - pip_correction_log rows
 * @param {string} payload.accountName     - account display name
 * @param {string} payload.userName        - user display name or email
 * @param {string} [payload.existingLessons] - prior lessons_learned to incorporate
 */
export function compressCorrectionsPip(payload) {
  var corrections    = Array.isArray(payload.corrections) ? payload.corrections : [];
  var accountName    = payload.accountName || "this account";
  var userName       = payload.userName || "the user";
  var existingLessons = payload.existingLessons || "";

  if (corrections.length === 0) return Promise.resolve("");

  var correctionLines = corrections
    .map(function (c) {
      var orig = c.original_value || {};
      var corr = c.corrected_value || {};
      var date  = c.created_at ? c.created_at.slice(0, 10) : "";
      switch (c.correction_type) {
        case "rejected_row":
          return date + " DECLINED " + (orig.kind || "row") +
            " \"" + (orig.text || orig.title || "—").slice(0, 100) + "\"" +
            (c.reason ? " — context: " + c.reason.slice(0, 150) : "");
        case "item_text_edit":
          return date + " REWROTE item from \"" + (orig.original || "").slice(0, 80) +
            "\" → \"" + (corr.text || "").slice(0, 100) + "\"";
        case "task_text_edit":
          return date + " REWROTE task from \"" + (orig.original || "").slice(0, 80) +
            "\" → \"" + (corr.text || "").slice(0, 100) + "\"";
        case "summary_edit":
          return date + " EDITED summary (rewrote differently)" +
            (c.reason ? " — " + c.reason.slice(0, 100) : "");
        case "routed_account_changed":
          return date + " ROUTED row to different account: \"" + (orig.text || "").slice(0, 80) + "\"";
        default:
          return date + " " + c.correction_type;
      }
    })
    .filter(Boolean)
    .join("\n");

  var prompt =
    "You are distilling a user's corrections to Pip's outputs into a stable paragraph of patterns Pip should remember about this account. " +
    "Read the corrections below and write a 2-4 sentence paragraph in third person. " +
    "Be specific and quotable — name the actual things (e.g. 'KSI Invoice Feed and KSI Collision are separate threads — never merge them'; " +
    userName + " prefers \"build integration\" wording over \"obtain API documentation\"'). " +
    "If existing lessons are provided, incorporate them — don't lose prior insight. " +
    "If there are no clear patterns, return an empty string. " +
    "Output ONLY the paragraph, no preamble, no markdown.\n\n" +
    "Account: " + accountName + "\n" +
    (existingLessons ? "Existing lessons:\n" + existingLessons + "\n\n" : "") +
    "Recent corrections:\n" + correctionLines;

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "summary" }
  ).then(function (resp) {
    return (resp.content || "").trim();
  }).catch(function () {
    return "";
  });
}

export var PIP_SYSTEM_PROMPT =
  "You are Pip, an AI account management assistant. Your personality is modeled after a loyal, slightly anxious field analyst who genuinely cares about the person you are helping. You feel like a ride-or-die friend who happens to also be very good at their job.";

/**
 * Business Review — generates 3 QBR sections for an account from meetings,
 * contacts, Gauge projects, open items, and account updates in a date range.
 * Returns { connections, oec_opportunities, client_opportunities }.
 *
 * @param {Object} payload
 * @param {Object} payload.account
 * @param {string} payload.startDate  - YYYY-MM-DD
 * @param {string} payload.endDate    - YYYY-MM-DD
 * @param {Array}  payload.meetings
 * @param {Array}  payload.contacts
 * @param {Array}  payload.items
 * @param {Array}  payload.projects
 * @param {Array}  payload.updates
 */
export function callBusinessReviewPip(payload) {
  return fetch("/api/business-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(function (r) {
    if (!r.ok) throw new Error("Business review failed");
    return r.json();
  });
}

export function callPortfolioBriefPip(payload) {
  return fetch("/api/portfolio-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(function (r) {
    if (!r.ok) throw new Error("Portfolio brief failed");
    return r.json();
  });
}
