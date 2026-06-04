// Rules-based intent classifier for Pip chat.
// Decides whether to short-circuit with a deterministic answer (0 tokens)
// or which `mode` to route to on the server.
//
// Exports:
//   classifyIntent(message, context) -> { mode, deterministicAnswer? }
//
// mode is one of: "chat" | "action" | "brief" | "summary" | "email"

var GREETING_RE = /^(?:hi+|hey+|hello|yo|sup|hola|howdy|gm|good\s+(?:morning|afternoon|evening))[\s!.?]*$/i;
var THANKS_RE = /^(?:thanks?(?:\s+you)?|thx|ty|ok|okay|kk|cool|nice|great|got\s+it|gotcha|sounds?\s+good|perfect|awesome|sweet|👍|🙏|❤️|😊|👌|💯|🔥)[\s!.?]*$/i;
var EMOJI_ONLY_RE = /^[\p{Emoji_Presentation}\s!.?]+$/u;

// "mark X done", "add a task", "remind me to" → action mode
var ACTION_RE = /\b(?:mark|complete|finish|done with|add\s+a?\s*(?:task|todo|reminder|item)|remind me|create\s+a?\s*(?:task|todo)|log\s+(?:a\s+)?meeting|set\s+(?:a\s+)?cadence|navigate\s+to|open\s+(?:the\s+)?(?:cadence|meeting|item|contact))\b/i;

// "brief me", "tell me about X", "prep me for X"
var BRIEF_RE = /\b(?:brief(?:\s+me)?|prep(?:\s+me)?\s+for|pre[-\s]?call|tell me about|what'?s? (?:going on|the deal) with|catch me up on|walk me through)\b/i;

// "summarize", "recap", "what came out of"
var SUMMARY_RE = /\b(?:summari[zs]e|recap|what came out of|wrap[-\s]?up|takeaways?\s+(?:from|on))\b/i;

// "draft an email", "follow up email"
var EMAIL_RE = /\b(?:draft\s+(?:an?|the)\s+email|follow[-\s]?up\s+email|send\s+(?:an?|the)\s+email|write\s+(?:an?|the)\s+email|email\s+(?:draft|to))\b/i;

// Lookup questions answerable from data
var COUNT_OVERDUE_RE = /\bhow many\s+(overdue|open|outstanding)\s+(items|tasks|things)\b/i;
var COUNT_ACCOUNTS_RE = /\bhow many\s+accounts\b/i;
var LAST_MEETING_RE = /\bwhen (?:did|was) (?:i|we)\s+(?:last\s+)?(?:meet|met|see|saw|talk(?:ed)?\s+to)\s+(?:with\s+)?(.+?)[?.!]?$/i;
var SCHEDULE_RE = /\b(?:what'?s?\s+(?:on\s+)?my schedule|what (?:do i have|am i doing)|schedule)\s+(?:today|this week|tomorrow)\b/i;

function trim(s) { return (s == null ? "" : String(s)).trim(); }

function isOverdue(item, today) {
  if (!item || !item.due_date) return false;
  return new Date(item.due_date) < today;
}

function countOpenItems(context) {
  var items = (context && context.openItems) || (context && context.items) || [];
  return items.filter(function (i) { return !i.done; }).length;
}

function countOverdueItems(context) {
  var items = (context && context.openItems) || (context && context.items) || [];
  var today = new Date(); today.setHours(0, 0, 0, 0);
  return items.filter(function (i) { return !i.done && isOverdue(i, today); }).length;
}

function findAccountByName(accounts, name) {
  if (!accounts || !name) return [];
  var lower = name.toLowerCase().trim();
  // Exact match first
  var exact = accounts.filter(function (a) { return a.name && a.name.toLowerCase() === lower; });
  if (exact.length > 0) return exact;
  // Substring match
  return accounts.filter(function (a) {
    return a.name && (a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase()));
  });
}

function lastMeetingFor(context, accountName) {
  var matches = findAccountByName(context.accounts || [], accountName);
  if (matches.length !== 1) return null; // ambiguous → let the model decide
  var acct = matches[0];
  var meetings = (context.meetings || context.recentMeetings || []).filter(function (m) {
    if (m.account_id) return m.account_id === acct.id;
    if (m.account) return m.account.toLowerCase() === acct.name.toLowerCase();
    if (m.folio_accounts) return m.folio_accounts.name === acct.name;
    return false;
  });
  if (meetings.length === 0) return { account: acct, meeting: null };
  // Sort by date desc
  meetings.sort(function (a, b) {
    var ad = a.meeting_date || a.date || "";
    var bd = b.meeting_date || b.date || "";
    return bd.localeCompare(ad);
  });
  return { account: acct, meeting: meetings[0] };
}

// Detect if the message mentions a brief/summary about a specific account.
// Returns true if any account name appears in the message text.
function mentionsAccount(message, accounts) {
  if (!accounts) return false;
  var lower = message.toLowerCase();
  return accounts.some(function (a) {
    return a.name && a.name.length > 2 && lower.includes(a.name.toLowerCase());
  });
}

export function classifyIntent(message, context) {
  var msg = trim(message);
  if (!msg) return { mode: "chat" };

  // 1. Greetings / thanks / emoji-only → deterministic, 0 tokens
  if (GREETING_RE.test(msg)) {
    return {
      mode: "chat",
      deterministicAnswer: "Hey. What's on your plate?",
    };
  }
  if (THANKS_RE.test(msg)) {
    return {
      mode: "chat",
      deterministicAnswer: "Anytime.",
    };
  }
  if (EMOJI_ONLY_RE.test(msg)) {
    return {
      mode: "chat",
      deterministicAnswer: "👍",
    };
  }

  // 2. Lookup questions answerable from data → deterministic
  if (COUNT_OVERDUE_RE.test(msg)) {
    var which = msg.match(COUNT_OVERDUE_RE)[1].toLowerCase();
    var count = which === "overdue" ? countOverdueItems(context) : countOpenItems(context);
    var label = which === "overdue" ? "overdue" : "open";
    return {
      mode: "chat",
      deterministicAnswer: count === 0
        ? "Nothing " + label + " right now. Breathe."
        : count + " " + label + " " + (count === 1 ? "item" : "items") + ".",
    };
  }
  if (COUNT_ACCOUNTS_RE.test(msg)) {
    var n = (context && context.accounts || []).length;
    return {
      mode: "chat",
      deterministicAnswer: n + " " + (n === 1 ? "account" : "accounts") + " on the books.",
    };
  }
  var lastMatch = msg.match(LAST_MEETING_RE);
  if (lastMatch) {
    var name = lastMatch[1].trim();
    var result = lastMeetingFor(context || {}, name);
    if (result && result.meeting) {
      var d = result.meeting.meeting_date || result.meeting.date;
      return {
        mode: "chat",
        deterministicAnswer: "Last met with **" + result.account.name + "** on " + d + "" +
          (result.meeting.title ? " — " + result.meeting.title : "") + ".",
      };
    }
    if (result && !result.meeting) {
      return {
        mode: "chat",
        deterministicAnswer: "No meetings logged for **" + result.account.name + "** yet.",
      };
    }
    // Ambiguous — fall through to model
  }
  if (SCHEDULE_RE.test(msg)) {
    // Fall through — schedule rendering depends on cadence/meeting structure
    // that's easier to surface via model context. Could be deterministic later.
  }

  // 3. Action / brief / summary / email routing
  if (ACTION_RE.test(msg)) {
    return { mode: "action" };
  }
  // email and summary modes strip Pip's persona and expect JSON output — they only
  // work correctly when there's a specific account in scope. Without an identified
  // account the response is terse/broken. Gate both behind account detection
  // the same way brief is gated.
  if (EMAIL_RE.test(msg) && mentionsAccount(msg, (context || {}).accounts)) {
    return { mode: "email" };
  }
  if (BRIEF_RE.test(msg) && mentionsAccount(msg, (context || {}).accounts)) {
    return { mode: "brief" };
  }
  if (SUMMARY_RE.test(msg) && mentionsAccount(msg, (context || {}).accounts)) {
    return { mode: "summary" };
  }

  return { mode: "chat" };
}
