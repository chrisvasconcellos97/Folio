// Pip native-tool-use definitions.
//
// Used both by the server (api/pip.js sends `tools: PIP_TOOLS` to Anthropic)
// and the client (PipView routes tool_use blocks through routeToolCall()).
//
// Keep tool descriptions TIGHT — they ride in the system prompt of every call
// and cost tokens. Lean on parameter descriptions to disambiguate.

export var PIP_TOOLS = [
  // ---- Open-modal actions (no DB write) --------------------------------
  {
    name: "open_meeting",
    description: "Open the Log Meeting modal for the named account.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Exact account name from CURRENT CONTEXT." },
      },
      required: ["account_name"],
    },
  },
  {
    name: "open_item",
    description: "Open the Add Open Item modal for the named account.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Exact account name from CURRENT CONTEXT." },
      },
      required: ["account_name"],
    },
  },
  {
    name: "open_contact",
    description: "Open the Add Contact modal for the named account.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Exact account name from CURRENT CONTEXT." },
      },
      required: ["account_name"],
    },
  },
  {
    name: "open_cadence",
    description: "Open the Set Cadence modal for the named account, optionally prefilled with schedule fields the user mentioned.",
    input_schema: {
      type: "object",
      properties: {
        account_name: { type: "string", description: "Exact account name from CURRENT CONTEXT." },
        prefill: {
          type: "object",
          properties: {
            frequency:        { type: "string", enum: ["weekly", "biweekly", "monthly"] },
            day_of_week:      { type: "integer", description: "0=Sun ... 6=Sat" },
            day_of_month:     { type: "integer", description: "1-31" },
            monthly_type:     { type: "string", enum: ["day_of_month", "day_of_week"] },
            monthly_ordinal:  { type: "string", enum: ["first", "second", "third", "fourth", "last"] },
            meeting_time:     { type: "string", description: "24-hour HH:MM" },
          },
        },
      },
      required: ["account_name"],
    },
  },
  {
    name: "navigate",
    description: "Navigate the user to a top-level view.",
    input_schema: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["accounts", "meetings", "pipeline", "cadence"] },
      },
      required: ["view"],
    },
  },

  // ---- Quick-task actions (already DB-writing via existing hook) -------
  {
    name: "complete_task",
    description: "Mark a quick task complete. Use the task id from OPEN QUICK TASKS context.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID of the task." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "add_quick_task",
    description: "Add a new quick task to the user's tray.",
    input_schema: {
      type: "object",
      properties: {
        title:      { type: "string" },
        notes:      { type: "string" },
        account_id: { type: "string", description: "Optional account UUID from context." },
      },
      required: ["title"],
    },
  },

  // ---- Direct-commit actions (write to DB via the user's session) ------
  {
    name: "create_open_item",
    description: "Create an open item (commitment / todo) on an account.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "UUID from the ACCOUNT header." },
        text:       { type: "string", description: "What needs to happen." },
        due_date:   { type: "string", description: "ISO date YYYY-MM-DD, optional." },
        owner:      { type: "string", description: "Owner name, optional." },
      },
      required: ["account_id", "text"],
    },
  },
  {
    name: "log_meeting",
    description: "Log a meeting that already happened on an account. Writes a full meeting record.",
    input_schema: {
      type: "object",
      properties: {
        account_id:     { type: "string" },
        title:          { type: "string" },
        meeting_date:   { type: "string", description: "ISO date YYYY-MM-DD." },
        notes:          { type: "string" },
        action_items:   { type: "string" },
        follow_up_date: { type: "string", description: "ISO date, optional." },
      },
      required: ["account_id", "title", "meeting_date"],
    },
  },
  {
    name: "set_follow_up",
    description: "Set a follow-up date on the most-recent meeting for an account.",
    input_schema: {
      type: "object",
      properties: {
        account_id:     { type: "string" },
        follow_up_date: { type: "string", description: "ISO date YYYY-MM-DD." },
      },
      required: ["account_id", "follow_up_date"],
    },
  },
  {
    name: "update_account_health",
    description: "Update an account's manual health status.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        status:     { type: "string", enum: ["active", "at_risk", "cold"] },
      },
      required: ["account_id", "status"],
    },
  },
  {
    name: "schedule_cadence",
    description: "Create a recurring meeting cadence on an account, writing directly without a modal.",
    input_schema: {
      type: "object",
      properties: {
        account_id:      { type: "string" },
        frequency:       { type: "string", enum: ["weekly", "biweekly", "monthly"] },
        day_of_week:     { type: "integer", description: "0=Sun ... 6=Sat" },
        day_of_month:    { type: "integer" },
        monthly_type:    { type: "string", enum: ["day_of_month", "day_of_week"] },
        monthly_ordinal: { type: "string", enum: ["first", "second", "third", "fourth", "last"] },
        meeting_time:    { type: "string", description: "24-hour HH:MM" },
      },
      required: ["account_id", "frequency"],
    },
  },

  // ---- Memory --------------------------------------------------------
  {
    name: "remember_fact",
    description: "Save a stable preference or fact about the user for future calls. Use sparingly — only for things worth remembering forever (preferred reply style, territory, naming preferences, etc.). Not for ephemeral notes.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "A short declarative sentence (e.g. 'Prefers concise replies', 'Covers the West region')." },
      },
      required: ["fact"],
    },
  },
];

// ----- Client-side routing helpers --------------------------------------
//
// routeToolCall(tool, ctx) executes ONE tool call against the user's Supabase
// session via the hook callbacks bundled in ctx. Returns a Promise that
// resolves to { kind: 'executed' | 'opened' | 'noop', label?, error? }.
//
// Tool calls are split into three families:
//   - "open"    — open a prefilled modal in the UI (uses ctx.onOpenAction)
//   - "execute" — DB write via a hook callback (no modal)
//   - "navigate"— top-level view change (uses ctx.onNavigate)
//
// findAccount() resolves account_name strings against ctx.accounts.

export function findAccountByName(accounts, name) {
  if (!name || !Array.isArray(accounts)) return null;
  var lower = String(name).toLowerCase();
  // Exact match first, then case-insensitive substring.
  var exact = accounts.find(function (a) { return a.name && a.name.toLowerCase() === lower; });
  if (exact) return exact;
  return accounts.find(function (a) {
    return a.name && (a.name.toLowerCase().indexOf(lower) !== -1 || lower.indexOf(a.name.toLowerCase()) !== -1);
  }) || null;
}

export function classifyTool(name) {
  if (name === "navigate") return "navigate";
  if (name && name.indexOf("open_") === 0) return "open";
  return "execute";
}

// Return a short human-readable label describing what this tool call does.
// Used for the confirmation card and toast messages.
export function describeToolCall(tool, accounts) {
  var input = tool.input || {};
  var acct = input.account_id
    ? (accounts || []).find(function (a) { return a.id === input.account_id; })
    : (input.account_name ? findAccountByName(accounts, input.account_name) : null);
  var acctName = acct ? acct.name : (input.account_name || null);

  switch (tool.name) {
    case "open_meeting":     return "Log Meeting" + (acctName ? " — " + acctName : "");
    case "open_item":        return "Add Open Item" + (acctName ? " — " + acctName : "");
    case "open_contact":     return "Add Contact" + (acctName ? " — " + acctName : "");
    case "open_cadence":     return "Set Cadence" + (acctName ? " — " + acctName : "");
    case "navigate":         return "Go to " + (input.view || "view");
    case "complete_task":    return "Mark task done";
    case "add_quick_task":   return "Add task: " + (input.title || "—");
    case "create_open_item": return "Create open item" + (acctName ? " on " + acctName : "") + (input.text ? ": " + input.text : "");
    case "log_meeting":      return "Log meeting" + (acctName ? " on " + acctName : "") + (input.title ? ": " + input.title : "");
    case "set_follow_up":    return "Set follow-up" + (acctName ? " on " + acctName : "") + (input.follow_up_date ? " for " + input.follow_up_date : "");
    case "update_account_health": return "Mark " + (acctName || "account") + " " + (input.status || "");
    case "schedule_cadence": return "Schedule " + (input.frequency || "cadence") + (acctName ? " on " + acctName : "");
    case "remember_fact":    return "Remember: " + (input.fact || "");
    default:                 return tool.name;
  }
}

// Execute one tool call. Returns Promise resolving to { kind, label, error? }.
// `ctx` is a bag of callbacks/data wired up in PipView.
export function routeToolCall(tool, ctx) {
  ctx = ctx || {};
  var input = tool.input || {};
  var accounts = ctx.accounts || [];
  var label = describeToolCall(tool, accounts);

  function err(e) {
    return { kind: "error", label: label, error: e && e.message ? e.message : String(e) };
  }

  function resolveAccount() {
    if (input.account_id) {
      return accounts.find(function (a) { return a.id === input.account_id; }) || null;
    }
    if (input.account_name) {
      return findAccountByName(accounts, input.account_name);
    }
    return null;
  }

  switch (tool.name) {
    // ---- Navigate ----
    case "navigate":
      if (ctx.onNavigate && input.view) {
        ctx.onNavigate(input.view);
        return Promise.resolve({ kind: "navigate", label: label });
      }
      return Promise.resolve({ kind: "noop", label: label });

    // ---- Open-modal (uses existing onOpenAction in PipView) ----
    case "open_meeting":
    case "open_item":
    case "open_contact":
    case "open_cadence": {
      var account = resolveAccount();
      if (!account) return Promise.resolve(err(new Error("account not found")));
      if (ctx.onOpenAction) {
        ctx.onOpenAction({ type: tool.name, accountName: account.name, prefill: input.prefill || null }, account);
      }
      return Promise.resolve({ kind: "open", label: label });
    }

    // ---- Quick tasks ----
    case "complete_task":
      if (!input.task_id || !ctx.updateTask) return Promise.resolve(err(new Error("missing task_id or hook")));
      return ctx.updateTask(input.task_id, { done: true })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);

    case "add_quick_task":
      if (!input.title || !ctx.addTask) return Promise.resolve(err(new Error("missing title or hook")));
      return ctx.addTask({
        title:      input.title,
        notes:      input.notes || null,
        account_id: input.account_id || null,
      })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);

    // ---- Direct commits ----
    case "create_open_item": {
      if (!ctx.addItem) return Promise.resolve(err(new Error("addItem unavailable")));
      var acct = resolveAccount();
      if (!acct) return Promise.resolve(err(new Error("account not found")));
      return ctx.addItem({
        account_id: acct.id,
        text:       input.text,
        due_date:   input.due_date || null,
        owner:      input.owner || null,
      })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);
    }

    case "log_meeting": {
      if (!ctx.addMeeting) return Promise.resolve(err(new Error("addMeeting unavailable")));
      var acctLm = resolveAccount();
      if (!acctLm) return Promise.resolve(err(new Error("account not found")));
      return ctx.addMeeting({
        account_id:     acctLm.id,
        title:          input.title || "Meeting",
        meeting_date:   input.meeting_date,
        notes:          input.notes || null,
        action_items:   input.action_items || null,
        follow_up_date: input.follow_up_date || null,
      })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);
    }

    case "set_follow_up":
      if (!ctx.setFollowUp) return Promise.resolve(err(new Error("setFollowUp unavailable")));
      return ctx.setFollowUp(input.account_id, input.follow_up_date)
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);

    case "update_account_health":
      if (!ctx.updateAccount) return Promise.resolve(err(new Error("updateAccount unavailable")));
      return ctx.updateAccount(input.account_id, { status: input.status })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);

    case "schedule_cadence": {
      if (!ctx.addCadence) return Promise.resolve(err(new Error("addCadence unavailable")));
      var data = { account_id: input.account_id, frequency: input.frequency };
      if (input.day_of_week != null) data.day_of_week = input.day_of_week;
      if (input.day_of_month != null) data.day_of_month = input.day_of_month;
      if (input.monthly_type) data.monthly_type = input.monthly_type;
      if (input.monthly_ordinal) data.monthly_ordinal = input.monthly_ordinal;
      if (input.meeting_time) data.meeting_time = input.meeting_time;
      return ctx.addCadence(data)
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);
    }

    case "remember_fact":
      if (!input.fact || !ctx.addFact) return Promise.resolve(err(new Error("missing fact or hook")));
      return ctx.addFact({ fact: input.fact, source: "pip_inferred" })
        .then(function () { return { kind: "executed", label: label }; })
        .catch(err);

    default:
      return Promise.resolve({ kind: "noop", label: label });
  }
}

// Group an array of tool calls and decide if confirmation is needed.
// Returns { needsConfirmation: boolean, immediate: Tool[], confirm: Tool[], dominantType?: string }
//
// Rule: if more than CONFIRM_THRESHOLD calls of the same destructive type
// appear in one response, require confirmation for ALL of them. Otherwise
// execute immediately.
export var CONFIRM_THRESHOLD = 3;

export function planToolCalls(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return { needsConfirmation: false, immediate: [], confirm: [] };
  }
  var counts = {};
  tools.forEach(function (t) { counts[t.name] = (counts[t.name] || 0) + 1; });
  var triggers = Object.keys(counts).filter(function (k) {
    // Only count writes/opens — `navigate` and `remember_fact` don't bulk up.
    return counts[k] > CONFIRM_THRESHOLD && k !== "navigate" && k !== "remember_fact";
  });
  if (triggers.length) {
    return {
      needsConfirmation: true,
      immediate: [],
      confirm: tools,
      dominantType: triggers[0],
    };
  }
  return { needsConfirmation: false, immediate: tools, confirm: [] };
}
