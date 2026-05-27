import { supabase } from "./supabase";
import { streamPip } from "./pipStream";
import { classifyIntent } from "./pipIntent";

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

function pipFetch(url, options, retried) {
  return fetchWithTimeout(url, options).then(function (res) {
    if (res.status === 429) {
      return Promise.reject(new Error("Pip is busy, try again in a moment"));
    }
    if (res.status >= 500 && !retried) {
      return pipFetch(url, options, true);
    }
    if (!res.ok) throw new Error("Pip proxy error: " + res.status);
    return res.json();
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
  return authHeaders().then(function (headers) {
    if (body.stream) {
      return streamPip(PROXY_URL, body, headers, opts.onDelta, opts.onToolUse).then(function (r) {
        // Normalize shape — always expose toolCalls (default []).
        return { content: r.content || "", toolCalls: r.toolCalls || [], meta: r.meta || null };
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
    "Summarize this meeting AND draft a follow-up email. Return ONLY valid JSON: {\"summary\":\"...\",\"email\":\"...\"}.\n\n" +
    "Account: " + (payload.accountName || "—") + "\n" +
    "Meeting: " + (m.title || "Untitled") + " (" + (m.meeting_date || "") + ")\n" +
    (m.notes          ? "Notes: " + m.notes + "\n" : "") +
    (m.talking_points ? "Talking points: " + m.talking_points + "\n" : "") +
    (m.action_items   ? "Action items: " + m.action_items + "\n" : "") +
    (m.commitments    ? "Commitments: " + m.commitments + "\n" : "") +
    "\nSummary: 2-3 sentences. Email body only (no subject, plain prose).";

  return callPipApi(
    [{ role: "user", content: prompt }],
    null,
    { mode: "summary" }
  ).then(function (resp) {
    var text = resp.content || "";
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) return { summary: text, email: "" };
    try {
      var parsed = JSON.parse(match[0]);
      return { summary: parsed.summary || "", email: parsed.email || "" };
    } catch (e) {
      return { summary: text, email: "" };
    }
  });
}

export var PIP_SYSTEM_PROMPT =
  "You are Pip, an AI account management assistant. Your personality is modeled after a loyal, slightly anxious field analyst who genuinely cares about the person you are helping. You feel like a ride-or-die friend who happens to also be very good at their job.";
