import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  } catch (authErr) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  var { text, accounts, contacts, openThreads } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(200).json({ empty: true });
  }

  var accountsArr   = Array.isArray(accounts)    ? accounts    : [];
  var contactsArr   = Array.isArray(contacts)     ? contacts    : [];
  var threadsArr    = Array.isArray(openThreads)  ? openThreads : [];

  var accountMap = {};
  accountsArr.forEach(function (a) { if (a && a.id) accountMap[a.id] = a.name; });

  var accountList = accountsArr.length
    ? accountsArr.map(function (a) { return "- " + a.id + " · " + a.name; }).join("\n")
    : "(none)";

  var contactList = contactsArr.length
    ? contactsArr.map(function (c) {
        return "- " + (c.name || "?") + " · " + (c.email || "no email") + " · account: " + (accountMap[c.accountId] || c.accountId || "?");
      }).join("\n")
    : "(none)";

  var threadList = threadsArr.length
    ? threadsArr.map(function (t) {
        return "- threadId:" + t.id + " · norm:" + t.subjectNorm + " · account:" + (accountMap[t.accountId] || t.accountId || "?");
      }).join("\n")
    : "(none)";

  var systemPrompt = `You are a parser that reads a pasted email roundup and returns structured JSON.

The user has a daily email roundup artifact from their AI assistant that categorizes emails by keyword:
- "Action:" or "Committed:" — something to do or a promise made
- "Waiting:" or "Still waiting:" — awaiting a reply
- "Logged:" — informational, no action needed
- "Update:" — status update, may resolve a prior thread

Each group of emails is under an account or person name heading.

Return ONLY valid JSON with this exact shape (no preamble, no markdown):
{
  "roundup_date": "YYYY-MM-DD or today's date if not stated",
  "empty": false,
  "contacts": [
    {
      "name": "Full Name",
      "account_name_raw": "account name as written",
      "account_id": "UUID from account list or null",
      "email": "email@example.com or null",
      "is_new_flagged": true,
      "match": "email|name|none"
    }
  ],
  "accounts": [
    {
      "account_name_raw": "name as written in roundup",
      "account_id": "UUID from account list or null",
      "match_confidence": "high|medium|low",
      "threads": [
        {
          "subject_raw": "original email subject",
          "action_type": "action|committed|waiting|still_waiting|logged|update",
          "summary": "1-2 sentence description of what happened",
          "contact_name_raw": "sender/recipient name or null",
          "due_date": "YYYY-MM-DD or null",
          "is_resolution": false,
          "confidence": "high|medium|low"
        }
      ]
    }
  ]
}

Rules:
- action_type must be exactly one of: action, committed, waiting, still_waiting, logged, update
- is_resolution: set true when this email closes or resolves a prior open thread
- Match accounts: use the provided account list. If a roundup account matches an entry, set account_id. Otherwise null.
- Match contacts: if a contact name/email appears in the provided contacts list, set match = "email" or "name". Otherwise match = "none" and is_new_flagged = true.
- All account_id values you return MUST be UUIDs from the provided accounts list — never invent IDs.
- All dates must match YYYY-MM-DD format.
- If the text contains no emails at all (just whitespace or a greeting), return { "empty": true }.
- Keep summaries short and factual — no editorializing.`;

  var userContent =
    "ACCOUNTS IN THIS USER'S FOLIOS:\n" + accountList + "\n\n" +
    "KNOWN CONTACTS:\n" + contactList + "\n\n" +
    "OPEN EMAIL THREADS (for fuzzy matching):\n" + threadList + "\n\n" +
    "EMAIL ROUNDUP TEXT:\n" + text;

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    });

    var raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();

    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
      return res.status(200).json({ empty: true, error: "parse_failed" });
    }

    if (!parsed || parsed.empty) return res.status(200).json({ empty: true });

    var validAccountIds = new Set(accountsArr.map(function (a) { return a.id; }));
    if (Array.isArray(parsed.accounts)) {
      parsed.accounts.forEach(function (acct) {
        if (acct.account_id && !validAccountIds.has(acct.account_id)) {
          acct.account_id = null;
          acct.match_confidence = "low";
        }
        if (Array.isArray(acct.threads)) {
          acct.threads.forEach(function (t) {
            if (t.due_date && !DATE_RE.test(t.due_date)) t.due_date = null;
          });
        }
      });
    }
    if (Array.isArray(parsed.contacts)) {
      parsed.contacts.forEach(function (c) {
        if (c.account_id && !validAccountIds.has(c.account_id)) c.account_id = null;
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("[email-import]", e);
    return res.status(500).json({ error: "Pip is unavailable right now.", detail: e.message });
  }
}
