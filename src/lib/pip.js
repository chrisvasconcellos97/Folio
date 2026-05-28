import { supabase } from "./supabase";
import { streamPip } from "./pipStream";
import { classifyIntent } from "./pipIntent";
import { logError } from "./errorLog";
import { timed } from "./net";

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
  });
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

  var userMsg = "Give me a pre-call brief for **" + (account.name || "this account") + "**.";

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
  var prompt =
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
 * against existing folio_items + Gauge tasks. Callers must run the plan
 * through PipSummarizePreview before applying.
 *
 * Backwards-compat: if Pip returns the old flat shape (summary +
 * action_items[]), we synthesize a plan of new_item rows so the preview
 * still renders something meaningful.
 *
 * @param {Object} payload
 * @param {Object} payload.draft           - the meeting/draft object
 * @param {string} payload.accountName     - parent account name
 * @param {string} payload.cadenceLabel    - cadence label for context
 * @param {string} [payload.accountId]     - the account id (for hints)
 * @param {Array}  [payload.existingItems] - open folio_items on the account
 * @param {Array}  [payload.activeProjects]- gauge projects (with .stages tasks)
 * @param {Array}  [payload.orgMembers]    - org members (for assignee options)
 * @param {Array}  [payload.assignmentHints] - learned hints rows
 */
export function summarizeDraftPip(payload) {
  var m              = payload.draft || {};
  var existingItems  = Array.isArray(payload.existingItems)  ? payload.existingItems  : [];
  var activeProjects = Array.isArray(payload.activeProjects) ? payload.activeProjects : [];
  var orgMembers     = Array.isArray(payload.orgMembers)     ? payload.orgMembers     : [];
  var hints          = Array.isArray(payload.assignmentHints) ? payload.assignmentHints : [];

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

  var prompt =
    "You are planning post-meeting bookkeeping. Compare the meeting notes against the user's " +
    "existing open items and existing in-flight Gauge tasks. Return a structured plan that " +
    "AVOIDS duplicates and prefers updates/closes over new rows.\n\n" +
    "Return ONLY valid JSON with this exact shape (no preamble, no markdown):\n" +
    "{\n" +
    "  \"summary\": \"2-3 sentence summary\",\n" +
    "  \"follow_up_date\": \"YYYY-MM-DD or null\",\n" +
    "  \"plan\": [\n" +
    "    { \"kind\": \"new_item\",    \"text\": \"...\", \"due_date\": \"YYYY-MM-DD or null\", \"suggested_assignee\": \"email or null\", \"confidence\": \"high|medium|low\" },\n" +
    "    { \"kind\": \"update_item\", \"target_id\": \"I-...\", \"fields\": { \"due_date\": \"...\", \"text\": \"...\" }, \"confidence\": \"high|medium|low\" },\n" +
    "    { \"kind\": \"close_item\",  \"target_id\": \"I-...\", \"reason\": \"...\", \"confidence\": \"high|medium|low\" },\n" +
    "    { \"kind\": \"new_task\",    \"project_id\": \"uuid\", \"title\": \"...\", \"due_date\": \"YYYY-MM-DD or null\", \"suggested_assignee\": \"email or null\", \"confidence\": \"high|medium|low\" },\n" +
    "    { \"kind\": \"update_task\", \"project_id\": \"uuid\", \"task_id\": \"T-...\", \"fields\": { \"due_date\": \"...\", \"task_status\": \"...\" }, \"confidence\": \"high|medium|low\" },\n" +
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
    "- Be GENEROUS extracting commitments — promises, follow-ups, things to verify — but route " +
    "them as updates whenever a relevant existing item/task exists.\n\n" +
    "── CONTEXT ──\n" +
    "Account: " + (payload.accountName || "—") + "\n" +
    "Cadence: " + (payload.cadenceLabel || "—") + "\n" +
    "Method: "  + (m.method || "—") + "\n" +
    "Date: "    + (m.meeting_date || "") + "\n" +
    "Title: "   + (m.title || "Conversation") + "\n\n" +
    "Existing open items on this account:\n" + itemLines + "\n\n" +
    "Existing in-flight Gauge tasks on this account (incl. child accounts):\n" + taskBlock + "\n\n" +
    "Active Gauge projects (use these ids for project_id):\n" +
    (activeProjects.length
      ? activeProjects.map(function (p) { return "- " + p.id + " · " + (p.title || "Untitled"); }).join("\n")
      : "(none)") + "\n\n" +
    "Org members (valid assignee emails):\n" + memberLines + "\n\n" +
    "Assignment hints (historical overrides on this account):\n" + hintLines + "\n\n" +
    "── NOTES ──\n" +
    (m.notes        ? m.notes + "\n" : "(empty)\n") +
    (m.action_items ? "\nExtra action notes: " + m.action_items + "\n" : "") +
    (m.commitments  ? "Commitments: " + m.commitments + "\n" : "");

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "summary" }
  ).then(function (resp) {
    var text = resp.content || "";
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) return { summary: text, plan: [], action_items: [], follow_up_date: null };
    try {
      var parsed = JSON.parse(match[0]);
      var planRaw = Array.isArray(parsed.plan) ? parsed.plan : null;
      var follow  = parsed.follow_up_date || null;
      var summary = parsed.summary || "";

      if (planRaw) {
        var plan = planRaw.map(normalizePlanRow).filter(Boolean);
        return {
          summary:        summary,
          follow_up_date: follow,
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
        follow_up_date: follow,
        plan:           synthPlan,
        action_items:   legacyItems,
      };
    } catch (e) {
      return { summary: text, plan: [], action_items: [], follow_up_date: null };
    }
  });
}

function normalizePlanRow(r) {
  if (!r || typeof r !== "object" || !r.kind) return null;
  var conf = r.confidence === "high" || r.confidence === "medium" || r.confidence === "low" ? r.confidence : "medium";
  var out  = { kind: r.kind, confidence: conf };
  switch (r.kind) {
    case "new_item":
      if (!r.text) return null;
      out.text = String(r.text);
      out.due_date = r.due_date || null;
      out.suggested_assignee = r.suggested_assignee || null;
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
  var cadence        = payload.cadence        || {};
  var account        = payload.account        || {};
  var meetings       = payload.meetings       || [];
  var openItems      = payload.openItems      || [];
  var activeProjects = payload.activeProjects || [];

  var projectLines = activeProjects.slice(0, 6).map(function (p) {
    var bits = [];
    bits.push((p.status || "").replace("_", " "));
    if (p.due_date) bits.push("due " + p.due_date);
    var owner = p._childAccountName ? " — for " + p._childAccountName : "";
    return "- " + (p.title || "Untitled") + " (" + bits.join(" · ") + ")" + owner;
  }).join("\n");

  var prompt =
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

export var PIP_SYSTEM_PROMPT =
  "You are Pip, an AI account management assistant. Your personality is modeled after a loyal, slightly anxious field analyst who genuinely cares about the person you are helping. You feel like a ride-or-die friend who happens to also be very good at their job.";
