import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

var RATE_MAP = new Map();

// Match the other synthesis endpoints — a Sonnet readout can run past the ~10s default.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  try {
    var authHeader = req.headers.authorization || "";
    var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    var now = Date.now();
    var last = RATE_MAP.get(user.id) || 0;
    if (now - last < 10000) return res.status(429).json({ error: "rate_limited" });
    RATE_MAP.set(user.id, now);
  } catch (authErr) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  var MAX_ARRAY = 200; // payload size cap — guard against unbounded client arrays
  var { meetingSummary, actionItems, contactName, portfolioState, wins, facts, profileProse } = req.body || {};
  if (!meetingSummary) return res.status(400).json({ error: "meetingSummary required" });

  try {
  var bossName = contactName || "your manager";

  // Cap unbounded client-supplied arrays to prevent oversized payloads.
  var portfolioStateCapped = Array.isArray(portfolioState) ? portfolioState.slice(0, MAX_ARRAY) : [];
  var actionItemsCapped    = Array.isArray(actionItems)    ? actionItems.slice(0, MAX_ARRAY)    : [];
  var factsCapped          = Array.isArray(facts)          ? facts.slice(0, MAX_ARRAY)          : [];
  var winsCapped           = Array.isArray(wins)           ? wins.slice(0, MAX_ARRAY)           : [];

  var portfolioSection = "";
  if (portfolioStateCapped.length > 0) {
    var healthy  = portfolioStateCapped.filter(function (s) { return s.health_status === "healthy" || s.health_status === "green"; }).length;
    var watching = portfolioStateCapped.filter(function (s) { return s.health_status === "watching" || s.health_status === "yellow"; }).length;
    var atRisk   = portfolioStateCapped.filter(function (s) { return s.health_status === "at_risk" || s.health_status === "red"; }).length;
    portfolioSection = "Portfolio: " + portfolioStateCapped.length + " accounts — " +
      healthy + " healthy, " + watching + " watching, " + atRisk + " at risk.\n" +
      portfolioStateCapped.slice(0, 8).map(function (s) {
        return "- " + s.account_name + ": " + (s.health_status || "?") +
          (s.overdue_item_count > 0 ? " · " + s.overdue_item_count + " overdue" : "") +
          (s.stuck_project_count > 0 ? " · " + s.stuck_project_count + " stuck" : "");
      }).join("\n");
  }

  var systemPrompt = "You are Pip, a loyal field analyst for an account manager. " +
    "Write a concise, professional email from the AM to their manager summarizing a 1:1 check-in and the current portfolio state. " +
    "Tone: direct, confident, no fluff. Use plain text — no markdown headers or bullet stars. " +
    "Structure: short opening acknowledging the conversation, a brief recap section, a wins/progress section when recent wins are provided (a manager update is where credit gets banked — surface them, don't only report risks), a portfolio snapshot section if data is available, and a closing note on priorities. " +
    "Keep it under 250 words. Do not include a subject line. Start with 'Hi [name],' on the first line. " +
    "Major-tier accounts carry the most revenue and relationship weight. Lead with them when surfacing risks, wins, or items needing attention. Don't bury a Major account issue behind Mid or Growth items.";

  // Inject what Pip has learned so the email uses the user's own vocabulary
  // (glossary facts) and reflects who they are (profile narrative).
  var knownBlock = "";
  if (typeof profileProse === "string" && profileProse.trim()) {
    knownBlock += "About the AM writing this:\n" + profileProse.trim() + "\n\n";
  }
  if (factsCapped.length) {
    knownBlock += "Their vocabulary / things they've taught you (use the right terms, don't explain them):\n" +
      factsCapped.slice(0, 20).map(function (f) { return "- " + f; }).join("\n") + "\n\n";
  }

  var userPrompt = knownBlock + "1:1 meeting summary:\n" + meetingSummary + "\n\n" +
    (actionItemsCapped.length ? "Action items from the call:\n" + actionItemsCapped.map(function(a) { return "- " + a; }).join("\n") + "\n\n" : "") +
    (winsCapped.length ? "Recent wins (the AM's own logged wins — bank these, it's a manager update):\n" + winsCapped.map(function (w) { return "- " + w; }).join("\n") + "\n\n" : "") +
    (portfolioSection ? "Portfolio state:\n" + portfolioSection + "\n\n" : "") +
    "Write the email to " + bossName + ".";

  var READOUT_MODEL = "claude-haiku-4-5-20251001";
    // User-scoped client for usage logging (RLS requires auth.uid()).
    var userClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var resp = await client.messages.create({
      model: READOUT_MODEL,
      max_tokens: 900,
      // cache_control on the static system prompt to reduce per-call cost.
      system:  [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      betas:    ["prompt-caching-2024-07-31"],
    });
    logPipUsage(userClient, user.id, "leadership-readout", "readout", READOUT_MODEL, resp.usage);
    if (resp.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "Readout was cut off — please retry." });
    }
    var email = resp.content[0].type === "text" ? resp.content[0].text.trim() : "";
    return res.status(200).json({ email: email });
  } catch (err) {
    console.error("[leadership-readout]", err && err.message);
    return res.status(500).json({ error: "pip_error" });
  }
}
