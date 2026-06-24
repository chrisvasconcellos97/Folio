// _pipAgentLoop.js — server-side execution for Pip's F5 chat agent loop.
//
// The loop's PURE control logic + tool definitions live in
// src/lib/pipAgentTools.js (unit-tested). This file is the thin I/O layer:
//   - executeReadTool(toolCall, ctx) — runs ONE read-only tool against the
//     caller's JWT-scoped Supabase client (RLS does the per-user scoping) and
//     returns a tool_result-shaped object.
//   - runAgentChat({...})            — drives the model<->tool loop using the
//     pure helpers, streaming text deltas through as they arrive.
//
// IMPORTANT: this module receives the Anthropic `client` as a parameter — it
// neither imports the model SDK nor constructs a client, so it stays outside
// Guard 3 (the unmetered-Pip-endpoint check; api/pip.js owns the metering).
// Usage logging happens via the `logUsage` callback the handler passes in,
// fired per model call, so the spend tile sees the full cost of a looped turn.
//
// Read tools read the user's OWN notebook data only (Data Line Rule: reading
// Chris's verbatim notes is allowed; the rule governs Pip soliciting/retaining
// business data — these tools do neither). Nothing here writes.

import { renderAccountContext } from "../src/lib/accountContext.js";
import {
  partitionToolUses,
  decideLoopStep,
  buildToolResultBlocks,
} from "../src/lib/pipAgentTools.js";

var TODAY = function () { return new Date().toISOString().slice(0, 10); };

function daysSinceIso(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function snippetAround(text, query, span) {
  if (!text) return "";
  var s = String(text).replace(/\s+/g, " ").trim();
  var idx = s.toLowerCase().indexOf(String(query).toLowerCase());
  if (idx === -1) return s.slice(0, span);
  var start = Math.max(0, idx - 60);
  var out = (start > 0 ? "…" : "") + s.slice(start, start + span);
  if (start + span < s.length) out += "…";
  return out;
}

// Resolve an account by name against the user's accounts (exact, then substring).
function resolveAccountByName(accounts, name) {
  if (!name || !Array.isArray(accounts)) return null;
  var lower = String(name).toLowerCase();
  var exact = accounts.find(function (a) { return a.name && a.name.toLowerCase() === lower; });
  if (exact) return exact;
  return accounts.find(function (a) {
    return a.name && (a.name.toLowerCase().indexOf(lower) !== -1 || lower.indexOf(a.name.toLowerCase()) !== -1);
  }) || null;
}

// Lazily fetch (and cache on ctx) the user's account list — id/name/scalars
// needed by every read tool. RLS scopes to the user via ctx.supabase's JWT.
async function getAccounts(ctx) {
  if (ctx._accounts) return ctx._accounts;
  var r = await ctx.supabase
    .from("folio_accounts")
    .select("id,name,account_type,tier,owner_user_id,objective,systems,status,status_override,status_override_reason,last_interaction_at,is_inactive")
    .limit(400);
  var rows = (r && r.data) ? r.data.filter(function (a) { return !a.is_inactive; }) : [];
  ctx._accounts = rows;
  return rows;
}

// ── lookup_account ────────────────────────────────────────────────────────
async function toolLookupAccount(input, ctx) {
  var accounts = await getAccounts(ctx);
  var acc = resolveAccountByName(accounts, input.account_name);
  if (!acc) {
    return "No account matched \"" + (input.account_name || "") + "\". Ask the user which account they mean.";
  }
  var sb = ctx.supabase;
  var mRes = await sb.from("folio_meetings")
    .select("meeting_date,title,notes,pip_summary,pip_tone,action_items,follow_up_date,attendees,theme,status")
    .eq("account_id", acc.id).neq("status", "scheduled")
    .order("meeting_date", { ascending: false }).limit(8);
  var tRes = await sb.from("folio_tasks")
    .select("title,due_date,assignee_email,owner:assignee_email,is_commitment,waiting_on,waiting_on_since,done,status,project_id,completed_at:closed_at")
    .eq("account_id", acc.id).eq("done", false).limit(60);
  var cRes = await sb.from("folio_contacts")
    .select("name,title,email,phone,is_poc,is_primary,is_leader,relationship_role,relationship_note,notes")
    .eq("account_id", acc.id).limit(10);
  var pRes = await sb.from("gauge_projects")
    .select("id,title,status,due_date,assignee,requested_by,waiting_on,waiting_on_since,status_updates")
    .eq("account_id", acc.id).not("status", "in", "(complete,on_hold)").limit(6);

  var tasks = (tRes && tRes.data) ? tRes.data : [];
  var projects = (pRes && pRes.data) ? pRes.data : [];
  projects.forEach(function (p) {
    p.tasks = tasks.filter(function (t) { return t.project_id === p.id; });
  });
  var openItems = tasks.filter(function (t) { return !t.project_id; });

  var bundle = {
    id: acc.id, name: acc.name, account_type: acc.account_type, tier: acc.tier,
    owner_user_id: acc.owner_user_id, objective: acc.objective, systems: acc.systems,
    status: acc.status, last_interaction_at: acc.last_interaction_at,
    status_override: acc.status_override, status_override_reason: acc.status_override_reason,
    meetings: (mRes && mRes.data ? mRes.data : []).map(function (m) {
      return {
        date: m.meeting_date, title: m.title, notes: m.notes, summary: m.pip_summary,
        tone: m.pip_tone, action_items: m.action_items, follow_up: m.follow_up_date,
        attendees: m.attendees, theme: m.theme,
      };
    }),
    openItems: openItems,
    contacts: (cRes && cRes.data) ? cRes.data : [],
    activeProjects: projects,
  };
  return renderAccountContext(bundle, { surface: "chat", userId: ctx.userId });
}

// ── find_open_work ──────────────────────────────────────────────────────
async function toolFindOpenWork(input, ctx) {
  var filter = input.filter || "all";
  var accounts = await getAccounts(ctx);
  var nameById = {};
  // Ownership: accounts someone else owns (MSO / project-involvement-only). The
  // app's convention (HomeView nudges, operator-run) is not-mine =
  // owner_user_id set AND != me. find_open_work answers "what do I owe / who has
  // the ball on MY work" — relationship/commitment work on a not-mine account
  // isn't the user's debt, so suppress it here (account-less leadership tasks,
  // which have no account_id, are always kept — they're the user's own).
  var notMine = {};
  accounts.forEach(function (a) {
    nameById[a.id] = a.name;
    if (a.owner_user_id && ctx.userId && a.owner_user_id !== ctx.userId) notMine[a.id] = true;
  });
  var today = TODAY();
  var sb = ctx.supabase;
  var lines = [];

  // Open tasks across the portfolio.
  var tRes = await sb.from("folio_tasks")
    .select("account_id,title,due_date,is_commitment,waiting_on,waiting_on_since,done,status")
    .eq("done", false).neq("status", "complete").limit(300);
  var tasks = (tRes && tRes.data) ? tRes.data : [];

  tasks.forEach(function (t) {
    if (t.account_id && notMine[t.account_id]) return; // not the user's relationship/debt
    var due = t.due_date || null;
    var overdue = due && due < today;
    var dueSoon = due && due >= today && due <= addDays(today, 7);
    var waiting = !!t.waiting_on;
    var keep =
      (filter === "all") ||
      (filter === "overdue" && overdue) ||
      (filter === "due_soon" && dueSoon) ||
      (filter === "waiting_on_them" && waiting);
    if (!keep) return;
    var acctName = nameById[t.account_id] || "(no account)";
    var tail = [];
    if (overdue) tail.push("OVERDUE " + Math.abs(daysBetween(due, today)) + "d");
    else if (dueSoon) tail.push("due " + due);
    if (waiting) tail.push("waiting on " + t.waiting_on + (t.waiting_on_since ? " since " + t.waiting_on_since : ""));
    if (t.is_commitment) tail.push("commitment");
    lines.push("- " + acctName + " — " + (t.title || "task") + (tail.length ? " · " + tail.join(" · ") : ""));
  });

  // Stalled / waiting projects.
  if (filter === "stalled" || filter === "waiting_on_them" || filter === "all") {
    var pRes = await sb.from("gauge_projects")
      .select("account_id,title,status,waiting_on,waiting_on_since,updated_at,status_updates")
      .eq("status", "in_progress").limit(200);
    (pRes && pRes.data ? pRes.data : []).forEach(function (p) {
      if (p.account_id && notMine[p.account_id]) return; // not the user's account
      var waiting = !!p.waiting_on;
      var idle = daysSinceIso(p.updated_at);
      var stalled = waiting || (idle != null && idle >= 10);
      var keep =
        (filter === "all" && stalled) ||
        (filter === "stalled" && stalled) ||
        (filter === "waiting_on_them" && waiting);
      if (!keep) return;
      var acctName = nameById[p.account_id] || "(no account)";
      var tail = [];
      if (waiting) tail.push("waiting on " + p.waiting_on + (p.waiting_on_since ? " since " + p.waiting_on_since : ""));
      if (idle != null) tail.push("no update in " + idle + "d");
      lines.push("- " + acctName + " — project: " + (p.title || "untitled") + (tail.length ? " · " + tail.join(" · ") : ""));
    });
  }

  if (!lines.length) return "Nothing matched filter \"" + filter + "\" — no open work in that slice right now.";
  return "OPEN WORK (" + filter + "):\n" + lines.slice(0, 25).join("\n");
}

function addDays(iso, n) {
  var d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  var da = new Date(a + "T00:00:00Z").getTime();
  var db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

// ── search_notes ──────────────────────────────────────────────────────────
async function toolSearchNotes(input, ctx) {
  var q = (input.query || "").trim();
  if (!q) return "Empty query — ask the user what to search for.";
  var accounts = await getAccounts(ctx);
  var nameById = {};
  accounts.forEach(function (a) { nameById[a.id] = a.name; });

  var sel = "id,account_id,meeting_date,title,notes,pip_summary";
  // Postgres full-text (stemming + multi-word + phrases), single-vendor, computed
  // on the fly — no second AI, no schema change. PostgREST FTS is per-column, so
  // search the user's own words AND Pip's summaries and merge. Falls back to
  // substring match on any error so search never hard-fails.
  var ftsOpts = { type: "websearch", config: "english" };
  var rows = [];
  try {
    var res = await Promise.all([
      ctx.supabase.from("folio_meetings").select(sel).textSearch("notes", q, ftsOpts).order("meeting_date", { ascending: false }).limit(15),
      ctx.supabase.from("folio_meetings").select(sel).textSearch("pip_summary", q, ftsOpts).order("meeting_date", { ascending: false }).limit(15),
    ]);
    if ((res[0] && res[0].error) && (res[1] && res[1].error)) throw new Error("fts unavailable");
    var seen = {};
    res.forEach(function (r) {
      if (r && !r.error && r.data) r.data.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = true; rows.push(m); } });
    });
  } catch (_) {
    // Strip %_ (ilike wildcards) AND ,() — the latter would otherwise alter the
    // PostgREST .or() filter structure (a comma splits conditions, parens regroup).
    var like = "%" + q.replace(/[%_,()]/g, "") + "%";
    var rf = await ctx.supabase.from("folio_meetings").select(sel)
      .or("notes.ilike." + like + ",pip_summary.ilike." + like)
      .order("meeting_date", { ascending: false }).limit(15);
    rows = (rf && rf.data) ? rf.data : [];
  }
  rows = rows.slice(0, 15);
  if (!rows.length) return "No notes or summaries mention \"" + q + "\".";
  var lines = rows.map(function (m) {
    var acctName = nameById[m.account_id] || "(no account)";
    var hay = (m.notes && m.notes.toLowerCase().indexOf(q.toLowerCase()) !== -1) ? m.notes : (m.pip_summary || m.notes || "");
    return "- " + acctName + " (" + (m.meeting_date || "?") + ") \"" + (m.title || "Meeting") + "\": " + snippetAround(hay, q, 200);
  });
  return "NOTE MATCHES for \"" + q + "\":\n" + lines.join("\n");
}

var READ_TOOL_EXECUTORS = {
  lookup_account: toolLookupAccount,
  find_open_work: toolFindOpenWork,
  search_notes:   toolSearchNotes,
};

// Execute one read tool. Always resolves (errors become is_error tool_results
// so the model can recover instead of the turn throwing).
export async function executeReadTool(toolCall, ctx) {
  var fn = READ_TOOL_EXECUTORS[toolCall.name];
  if (!fn) {
    return { tool_use_id: toolCall.id, content: "Unknown read tool: " + toolCall.name, is_error: true };
  }
  try {
    var content = await fn(toolCall.input || {}, ctx);
    return { tool_use_id: toolCall.id, content: content || "(no result)" };
  } catch (err) {
    console.error("[pip-agent] read tool", toolCall.name, "failed:", err && err.message);
    return { tool_use_id: toolCall.id, content: "That lookup failed. Answer with what you already have.", is_error: true };
  }
}

// runAgentChat — drives the model<->read-tool loop.
//
//   client    : Anthropic client (passed in; we don't import the SDK here)
//   baseParams: { model, max_tokens, system, tools }  (messages added per step)
//   messages  : initial conversation (array). Mutated locally (cloned).
//   supabase  : JWT-scoped client for read-tool queries (RLS per user)
//   userId    : caller id (for accountContext ownership framing)
//   maxSteps  : hard cap on model calls (default 4)
//   onText    : (delta) => void  — stream text deltas (null = buffered)
//   logUsage  : (usage) => void  — fired per model call (full cost visibility)
//
// Returns { content, actionToolCalls, stopReason, usage }.
// actionToolCalls are ACTION tools only — read tools are server-internal and
// never forwarded to the client.
export async function runAgentChat(opts) {
  var client    = opts.client;
  var base      = opts.baseParams || {};
  var messages  = (opts.messages || []).slice();
  var maxSteps  = typeof opts.maxSteps === "number" && opts.maxSteps > 0 ? opts.maxSteps : 4;
  var onText    = typeof opts.onText === "function" ? opts.onText : null;
  var logUsage  = typeof opts.logUsage === "function" ? opts.logUsage : function () {};
  var ctx       = { supabase: opts.supabase, userId: opts.userId };

  var fullText = "";
  var lastUsage = null;
  var lastStop = null;

  for (var step = 0; step < maxSteps; step++) {
    var forceFinal = step === maxSteps - 1;
    var params = {
      model:      base.model,
      max_tokens: base.max_tokens,
      system:     base.system,
      tools:      base.tools,
      messages:   messages,
    };
    if (typeof base.temperature === "number") params.temperature = base.temperature;
    // On the last allowed step, forbid tool use so the model MUST produce a
    // text answer — a graceful landing, never a half-finished loop. tool_choice
    // changes invalidate only the messages cache tier, not tools/system.
    if (forceFinal) params.tool_choice = { type: "none" };

    var final;
    if (onText) {
      var s = client.messages.stream(params);
      s.on("text", onText);
      final = await s.finalMessage();
    } else {
      final = await client.messages.create(params);
    }

    logUsage(final.usage);
    lastUsage = final.usage || lastUsage;
    lastStop = final.stop_reason || lastStop;

    if (Array.isArray(final.content)) {
      final.content.forEach(function (b) { if (b.type === "text" && b.text) fullText += b.text; });
    }

    var partition = partitionToolUses(final.content);
    var decision = decideLoopStep({ partition: partition, step: step, maxSteps: maxSteps });

    if (decision !== "continue") {
      return {
        content: fullText,
        actionToolCalls: partition.actionTools,
        stopReason: lastStop,
        usage: lastUsage,
      };
    }

    // Pure gathering turn — execute read tools server-side and continue.
    messages.push({ role: "assistant", content: final.content });
    var results = await Promise.all(partition.readTools.map(function (tc) {
      return executeReadTool(tc, ctx);
    }));
    messages.push({ role: "user", content: buildToolResultBlocks(results) });
  }

  // Unreachable (force_final returns inside the loop), but a safe default.
  return { content: fullText, actionToolCalls: [], stopReason: lastStop, usage: lastUsage };
}
