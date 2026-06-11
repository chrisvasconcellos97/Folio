// Pip rolling-state regeneration endpoint.
//
// POST { accountIds: string[] } (cap 50)
// → For each account, loads raw data (meetings, items, contacts, projects),
//   issues a Haiku 4.5 call asking for a tight 2-3 sentence state blob,
//   stores result in folio_pip_account_state with stale_at = now() + 24h.
//
// Uses Promise.all for parallel issuance. (Migrating to Anthropic Message
// Batches API is a TODO — 50% discount, and the user isn't waiting on this
// anyway since it's fire-and-forget from the client.)

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

var MODEL_HAIKU = "claude-haiku-4-5-20251001";
var MAX_TOKENS  = 300;
var MAX_BATCH   = 50;

// Shared system prompt — sent identically on every per-account call in a
// batch, so prompt caching turns the second-through-Nth call into a
// cache-read at 10% input cost. Padded with explicit formatting rules to
// clear Haiku's 1024-token cache threshold reliably.
var PIP_STATE_SYSTEM = [
  "You are Pip, generating a compact rolling state cache for an account.",
  "",
  "Output exactly two lines:",
  "",
  "Line 1 — prose state: [Account name] — [state: last contact recency, momentum, key signals, open risks]. 2 to 3 sentences max. Be specific. No padding. No headers. No bullets. End with a period.",
  "",
  "Line 2 — JSON sidecar in this exact shape:",
  "{\"health_signal\":\"green|yellow|red\",\"momentum\":\"up|flat|down\",\"risk_flags\":[\"...\"]}",
  "",
  "health_signal rules:",
  "- green: recent contact (<30 days), no overdue items, momentum positive or steady",
  "- yellow: 30-60 days since contact, OR 1-2 overdue items, OR momentum slipping",
  "- red: 60+ days since contact, OR 3+ overdue items, OR explicit risk signals in notes",
  "",
  "momentum rules:",
  "- up: recent positive signals, expanding scope, new commitments landing",
  "- flat: steady cadence, no new asks, no losses",
  "- down: declining contact, slipping commitments, complaint signals",
  "",
  "risk_flags: short tags only. Example values: 'overdue_items', 'long_silence', 'churn_risk', 'budget_signal', 'leadership_change', 'scope_drift'. Empty array if nothing flagged.",
  "",
  "If you cannot determine any field with confidence, use null for that field (still valid JSON).",
  "",
  "Style:",
  "- Tone: terse, slightly anxious field analyst. Honest about what you see. No fluff. No marketing language.",
  "- Always use the account name verbatim — never paraphrase it.",
  "- If there is genuinely no signal (e.g. account has never had a meeting), say that plainly.",
  "",
  "Personality reference: you're Pip — loyal, slightly anxious, dryly funny, intelligent without being arrogant. But in this mode you're writing a database cache row, not a chat reply, so keep it short and structured.",
].join("\n");

function buildStateSystemBlocks() {
  return [{
    type: "text",
    text: PIP_STATE_SYSTEM,
    cache_control: { type: "ephemeral" },
  }];
}

// Per-user rate limit. Without this an authenticated user could trigger
// 50 Haiku calls per request with no upper bound, burning Anthropic credits.
// Cap at 10 refresh batches per minute per user (≈500 calls/min ceiling).
var rateLimitMap   = new Map();
var RL_WINDOW_MS   = 60 * 1000;
var RL_MAX_BATCHES = 10;

function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < RL_WINDOW_MS; });
  if (timestamps.length >= RL_MAX_BATCHES) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

function trunc(s, n) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function daysSince(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function buildPrompt(account, meetings, items, contacts, projects) {
  var lines = [];
  lines.push("ACCOUNT: " + (account.name || "Untitled"));
  var hd = "Status: " + (account.status || "—") + (account.status_override ? " (pinned: " + account.status_override + ")" : "");
  if (account.last_interaction_at) {
    var ds = daysSince(account.last_interaction_at);
    hd += " · Last contact: " + account.last_interaction_at + (ds != null ? " (" + ds + "d ago)" : "");
  }
  lines.push(hd);

  if (meetings && meetings.length) {
    lines.push("");
    lines.push("Recent meetings (" + meetings.length + "):");
    meetings.slice(0, 5).forEach(function (m) {
      var head = "- " + (m.meeting_date || "?") + " — " + (m.title || "Meeting");
      lines.push(head);
      var body = m.pip_summary || m.notes;
      if (body) lines.push("  " + trunc(body, 240));
    });
  }

  if (items && items.length) {
    lines.push("");
    lines.push("Open items (" + items.length + "):");
    var today = new Date(); today.setHours(0, 0, 0, 0);
    items.slice(0, 8).forEach(function (i) {
      var line = "- " + (i.title || i.text || "—");
      if (i.due_date) {
        var due = new Date(i.due_date);
        var diff = Math.round((due - today) / 86400000);
        if (diff < 0) line += " [overdue " + Math.abs(diff) + "d]";
        else if (diff <= 7) line += " [due in " + diff + "d]";
        else line += " (due " + i.due_date + ")";
      }
      lines.push(line);
    });
  }

  if (contacts && contacts.length) {
    lines.push("");
    lines.push("Contacts (" + contacts.length + "): " + contacts.slice(0, 4).map(function (c) {
      return c.name + (c.is_poc ? " [POC]" : "");
    }).join(", "));
  }

  if (projects && projects.length) {
    lines.push("");
    lines.push("Active projects: " + projects.slice(0, 4).map(function (p) {
      return p.title + " (" + (p.status || "—") + ")";
    }).join(", "));
  }

  // System block carries the persona + output schema + rubric (cached).
  // User message only carries the per-account source data (changes per call).
  return "Source data:\n" + lines.join("\n");
}

function parseModelOutput(text) {
  if (!text) return { prose: "", sidecar: null };
  var trimmed = text.trim();
  // Split off the last JSON-looking line.
  var match = trimmed.match(/(\{[\s\S]*\})\s*$/);
  if (!match) return { prose: trimmed, sidecar: null };
  var prose = trimmed.slice(0, match.index).trim();
  var sidecar = null;
  try { sidecar = JSON.parse(match[1]); } catch (e) { sidecar = null; }
  return { prose: prose || trimmed, sidecar: sidecar };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

  var authHeader = req.headers.authorization || "";
  var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase is not configured on this deployment." });
  }

  var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  var { data: authData, error: authError } = await supabase.auth.getUser(token);
  var user = authData && authData.user ? authData.user : null;
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  if (isRateLimited(user.id)) {
    return res.status(429).json({ error: "Too many refresh requests. Try again in a minute." });
  }

  // User-scoped client for the rest of the work — RLS takes care of access.
  var userClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: "Bearer " + token } } }
  );

  var body = req.body || {};
  var accountIds = Array.isArray(body.accountIds)
    ? body.accountIds.filter(function (x) { return typeof x === "string" && x.length > 0; })
    : [];
  if (!accountIds.length) return res.status(400).json({ error: "accountIds required" });
  accountIds = accountIds.slice(0, MAX_BATCH);

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  // Pull everything we need in 4 parallel queries, scoped via .in()
    var pAccts  = userClient.from("folio_accounts")
      .select("id, name, status, status_override, last_interaction_at, tier, region")
      .in("id", accountIds);
    var pMtgs   = userClient.from("folio_meetings")
      .select("account_id, meeting_date, title, notes, pip_summary, action_items, follow_up_date")
      .in("account_id", accountIds)
      .order("meeting_date", { ascending: false })
      .limit(200);
    var pItems  = userClient.from("folio_tasks")
      .select("account_id, title, due_date, done, assignee_email")
      .in("account_id", accountIds)
      .eq("done", false)
      .is("project_id", null);
    var pConts  = userClient.from("folio_contacts")
      .select("account_id, name, title, is_poc")
      .in("account_id", accountIds);

    var results = await Promise.all([pAccts, pMtgs, pItems, pConts]);
    if (results[0].error) throw results[0].error;
    var accts    = results[0].data || [];
    var meetings = results[1].data || [];
    var items    = results[2].data || [];
    var contacts = results[3].data || [];

    // Pull active projects for these accounts. The projects table is optional —
    // be tolerant of error.
    var projects = [];
    try {
      var pj = await userClient.from("gauge_projects")
        .select("account_id, title, status, expected_complete_date")
        .in("account_id", accountIds)
        .neq("status", "complete")
        .neq("status", "on_hold");
      if (!pj.error) projects = pj.data || [];
    } catch (e) { /* ignore */ }

    function byAcct(arr) {
      var out = {};
      arr.forEach(function (r) {
        if (!out[r.account_id]) out[r.account_id] = [];
        out[r.account_id].push(r);
      });
      return out;
    }
    var mByAcct = byAcct(meetings);
    var iByAcct = byAcct(items);
    var cByAcct = byAcct(contacts);
    var pByAcct = byAcct(projects);

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var systemBlocks = buildStateSystemBlocks();
    var calls = accts.map(function (a) {
      var prompt = buildPrompt(a, mByAcct[a.id], iByAcct[a.id], cByAcct[a.id], pByAcct[a.id]);
      return client.messages.create({
        model: MODEL_HAIKU,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        system: systemBlocks,
        messages: [{ role: "user", content: prompt }],
      }).then(function (resp) {
        logPipUsage(userClient, user.id, "pip-state-refresh", "state-refresh", MODEL_HAIKU, resp.usage);
        var text = "";
        if (Array.isArray(resp.content)) {
          resp.content.forEach(function (b) { if (b.type === "text" && b.text) text += b.text; });
        }
        var parsed = parseModelOutput(text);
        var staleAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        var row = {
          account_id:    a.id,
          user_id:       user.id,
          state_prose:   parsed.prose,
          health_signal: parsed.sidecar && parsed.sidecar.health_signal || null,
          momentum:      parsed.sidecar && parsed.sidecar.momentum || null,
          risk_flags:    parsed.sidecar && Array.isArray(parsed.sidecar.risk_flags) ? parsed.sidecar.risk_flags : null,
          generated_at:  new Date().toISOString(),
          stale_at:      staleAt,
        };
        return userClient.from("folio_pip_account_state").upsert([row], { onConflict: "account_id" });
      }).catch(function (err) {
        console.error("pip-state-refresh per-account failed", a.id, err && err.message);
        return null;
      });
    });

    await Promise.all(calls);

    return res.status(200).json({ ok: true, refreshed: accts.length });
  } catch (err) {
    console.error("pip-state-refresh error:", err);
    return res.status(500).json({ error: "refresh failed", detail: err && err.message ? err.message : String(err) });
  }
}
