// pipAgentTools.js — the read-only tool family the F5 agent loop iterates on,
// plus the loop's PURE control logic.
//
// WHY THIS EXISTS (F5): chat used to be single-shot — the model emitted tool
// calls and the CLIENT executed them; the result never went back to the model.
// The agent loop lets Pip GATHER more on demand mid-turn (read a specific
// account deep, find stalled work, search notes), then keep reasoning, then
// act. The tools that do the gathering are these read-only ones; they execute
// SERVER-SIDE (api/_pipAgentLoop.js) and feed a tool_result back to the model.
//
// Pip's EXISTING tools (pipTools.js) are unchanged: they execute client-side
// and are TERMINAL within a chat turn (an action ends the loop and hands off to
// the client's confirm-card / frictionless path). A chat turn is therefore
// naturally either "gathering" (read tools → loop continues) or "acting" (an
// action tool → terminate). See docs/pip-architecture-f5-plan.md.
//
// PURE MODULE — NO Supabase, NO React, NO fetch. The risky control logic lives
// here so it can be unit-tested without network mocks; the I/O orchestration
// stays thin in api/_pipAgentLoop.js. Keep descriptions TIGHT (they ride in the
// tools block of every chat call) and Data-Line clean (ask for names / topics /
// status filters, NEVER for numbers).

export var PIP_READ_TOOLS = [
  {
    name: "lookup_account",
    description:
      "Look up the full current detail for ONE account when the loaded context isn't enough — recent meetings with notes, open items, contacts, and active projects. Call this when the user asks about an account that isn't in your context, or when you need deeper detail than the summary you can see. Returns that account's own data only; read-only.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Exact or close account name from CURRENT CONTEXT, or the name the user said." },
      },
      required: ["account_name"],
    },
  },
  {
    name: "find_open_work",
    description:
      "Find work that needs attention across all of the user's accounts: overdue commitments, stalled projects, items where the user is waiting on someone else, or things due soon. Call this when the user asks what they owe, what's slipping, what's stalled, or who has the ball — and the answer isn't already in your context. Returns concise rows (account, what, status, age); read-only.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["overdue", "stalled", "waiting_on_them", "due_soon", "all"],
          description: "Which slice of open work to return.",
        },
      },
      required: ["filter"],
    },
  },
  {
    name: "search_notes",
    description:
      "Search the user's own meeting notes and Pip summaries for a keyword or topic across all accounts. Call this when the user asks where or when something was discussed, or to recall a detail that isn't in your loaded context. Returns matching snippets with account and date; read-only.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A keyword or short phrase to search notes/summaries for." },
      },
      required: ["query"],
    },
  },
];

var READ_TOOL_NAMES = (function () {
  var s = {};
  PIP_READ_TOOLS.forEach(function (t) { s[t.name] = true; });
  return s;
})();

// True for the server-executed read tools the loop iterates on. Everything else
// (the pipTools.js action/open/navigate tools) is client-side and terminal.
export function isReadTool(name) {
  return !!READ_TOOL_NAMES[name];
}

// Split a model response's content blocks into read tools (loop-executable,
// server-internal), action tools (client-terminal), and whether any text was
// produced. Tool blocks are normalized to { id, name, input }.
export function partitionToolUses(contentBlocks) {
  var readTools = [];
  var actionTools = [];
  var hasText = false;
  (Array.isArray(contentBlocks) ? contentBlocks : []).forEach(function (b) {
    if (!b) return;
    if (b.type === "text" && b.text) { hasText = true; return; }
    if (b.type === "tool_use") {
      var tc = { id: b.id, name: b.name, input: b.input || {} };
      if (isReadTool(b.name)) readTools.push(tc);
      else actionTools.push(tc);
    }
  });
  return { readTools: readTools, actionTools: actionTools, hasText: hasText };
}

// Decide what the loop does after a model turn. PURE — drives runAgentChat.
//
//   "force_final" — this was the last allowed step (step >= maxSteps-1).
//                   The model was already told tool_choice:none, so its output
//                   is terminal text; stop.
//   "terminate"   — normal stop: no read tools to run, OR an action tool is
//                   present (action wins — hand off to the client; never leave
//                   an action tool_use unanswered by continuing the loop).
//   "continue"    — pure gathering turn (read tools present, no action tools)
//                   and steps remain → execute the read tools and loop.
//
// step is 0-indexed; maxSteps is the total allowed model calls.
export function decideLoopStep(params) {
  params = params || {};
  var p = params.partition || { readTools: [], actionTools: [] };
  var step = typeof params.step === "number" ? params.step : 0;
  var maxSteps = typeof params.maxSteps === "number" ? params.maxSteps : 4;

  if (step >= maxSteps - 1) return "force_final";
  if ((p.actionTools && p.actionTools.length) || !(p.readTools && p.readTools.length)) {
    return "terminate";
  }
  return "continue";
}

// Build the tool_result content blocks for a user turn from executed read-tool
// results. Each result: { tool_use_id, content (string), is_error? }.
export function buildToolResultBlocks(results) {
  return (Array.isArray(results) ? results : []).map(function (r) {
    var block = {
      type: "tool_result",
      tool_use_id: r.tool_use_id,
      content: typeof r.content === "string" ? r.content : JSON.stringify(r.content || ""),
    };
    if (r.is_error) block.is_error = true;
    return block;
  });
}
