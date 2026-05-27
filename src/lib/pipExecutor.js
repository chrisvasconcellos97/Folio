// pipExecutor — single shared execution path for Pip tool calls.
//
// Both the "fire immediately" path (frictionless tools: navigate, open_*,
// complete_task) and the "fire after confirm card" path (everything else)
// route through executeTool() so the actual write logic lives in one place.
//
// The signature deliberately wraps routeToolCall() in pipTools.js (which is
// kept for backward-compatibility and used by the existing tests). The
// resolved shape is normalized into
//   { ok, kind, label, message, navTarget?, error? }
// for consumers that prefer a uniform contract — used by PipActionCard for
// toast / inline feedback.

import { routeToolCall, describeToolCall, TOOL_META } from "./pipTools";

// Returns true for tools that should execute the moment Pip emits them —
// no card, no batch. Open-modal tools count as frictionless from the
// executor's perspective because their "confirm" is the modal itself.
export function isFrictionless(toolName) {
  var meta = TOOL_META[toolName];
  if (!meta) return false;
  return meta.category === "frictionless"
      || meta.category === "navigate"
      || meta.category === "open";
}

// Lightweight summary used for toasts + the post-confirm "Done — created" line.
function summarize(tool, result) {
  if (!result) return "";
  if (result.kind === "error") return result.error || "Something failed";
  switch (tool.name) {
    case "create_open_item":      return "Open item created";
    case "log_meeting":           return "Meeting logged";
    case "set_follow_up":         return "Follow-up set";
    case "update_account_health": return "Account health updated";
    case "schedule_cadence":      return "Cadence scheduled";
    case "add_quick_task":        return "Task added";
    case "complete_task":         return "Task completed";
    case "remember_fact":         return "Saved";
    case "navigate":              return "Navigated";
    default:
      if (result.kind === "open") return "Opened";
      return result.label || "Done";
  }
}

// executeTool({ tool, hooks }) — wraps routeToolCall in a normalized
// { ok, kind, label, message, navTarget?, error? } envelope.
//
//   hooks: { accounts, addItem, addMeeting, addCadence, updateAccount,
//            setFollowUp, addTask, updateTask, addFact, onOpenAction,
//            onNavigate }
export function executeTool(params) {
  params = params || {};
  var tool  = params.tool || {};
  var hooks = params.hooks || {};
  var accounts = hooks.accounts || [];
  var label = describeToolCall(tool, accounts);

  if (!tool.name) {
    return Promise.resolve({
      ok: false, kind: "error", label: label, message: "Unknown tool",
      error: "Tool call missing a name",
    });
  }
  if (!TOOL_META[tool.name]) {
    return Promise.resolve({
      ok: false, kind: "error", label: label, message: "Unknown tool",
      error: "No executor registered for " + tool.name,
    });
  }

  return routeToolCall(tool, hooks).then(function (r) {
    var ok = r && r.kind !== "error" && r.kind !== "noop";
    var navTarget = tool.name === "navigate" && tool.input ? tool.input.view : null;
    return {
      ok: ok,
      kind: r ? r.kind : "noop",
      label: label,
      message: summarize(tool, r),
      navTarget: navTarget,
      error: r && r.kind === "error" ? r.error : null,
    };
  });
}
