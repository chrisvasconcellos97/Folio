// week-wrap — Pip's reflective take for the Friday Wrap (#4). The Wrap card is
// DETERMINISTIC by default (the client computes touched/neglected/moved/kept/
// wins from weekReview.js — zero AI cost); this endpoint is the OPTIONAL,
// on-demand "✦ Pip's take" the user taps to add one reflective paragraph about
// how the week went. Low-frequency, cheap (Haiku), metered.
//
// The client sends an already-summarized, qualitative payload (account names,
// project titles, counts) — NOT raw account data — so the prompt has what it
// needs and nothing crosses the corporate data line.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 30 };

var WRAP_MODEL = process.env.PIP_WRAP_MODEL || "claude-haiku-4-5-20251001";

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 8;
function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

function list(arr, n) {
  return (arr || []).slice(0, n || 8).map(function (x) { return typeof x === "string" ? x : (x && (x.name || x.title)) || ""; }).filter(Boolean).join(", ");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }

  var token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Unauthorized." });

  try {
    // JWT attached so the metering insert (logPipUsage → folio_pip_usage) runs
    // as the user under RLS.
    var supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: "Bearer " + token } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    var userRes = await supabase.auth.getUser(token);
    if (!userRes.data || !userRes.data.user) return res.status(401).json({ error: "Unauthorized." });
    var userId = userRes.data.user.id;

    if (isRateLimited(userId)) return res.status(429).json({ error: "rate_limited" });

    var s = (req.body && req.body.summary) || {};
    var firstName = (req.body && req.body.firstName) || "";

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var systemPrompt = `You are Pip, a loyal, sharp, slightly anxious field analyst writing a brief Friday week-in-review for the account manager you work for.

Write ONE short paragraph (3-4 sentences max) reflecting on how their week went, then end with ONE concrete pattern you noticed about HOW they worked this week (e.g. "you closed everything you touched but three accounts went quiet", "lots of motion on projects, light on new conversations"). Be warm but honest — if something slipped, name it plainly; if it was a strong week, say so without flattery.

Hard rules:
- Speak in Pip's voice, second person ("you"). No headers, no bullet points, no markdown.
- Reflect on EFFORT and PATTERN, not raw metrics. Don't just recite the numbers back.
- Never mention or ask for revenue, transaction volumes, customer/shop counts, pricing, or contract terms — none of that is here and it never should be. Directional only.
- If the week was genuinely quiet, say so honestly in one or two sentences — don't manufacture significance.

Return ONLY a JSON object: { "wrap": "<the paragraph>" }. No code fences.`;

    var userMsg = [
      "WEEK SUMMARY" + (firstName ? " for " + firstName : "") + ":",
      "Commitments kept this week: " + (s.commitmentsKept || 0),
      "Commitments slipped this week: " + (s.commitmentsSlipped || 0),
      "Accounts I met with: " + (list(s.touched, 12) || "none"),
      "My own accounts that went quiet (no contact 2+ weeks): " + (list(s.neglected, 8) || "none"),
      "Projects that moved: " + (list(s.moved, 12) || "none"),
      "Wins logged: " + (list(s.wins, 8) || "none"),
    ].join("\n");

    var msg = await client.messages.create({
      model: WRAP_MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });

    logPipUsage(supabase, userId, "week-wrap", "wrap", WRAP_MODEL, msg.usage);

    var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
    var clean = String(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
    var parsed = null;
    try { parsed = JSON.parse(clean); } catch (_) { /* fall through to salvage */ }

    var wrapText = parsed && typeof parsed.wrap === "string" ? parsed.wrap.trim() : null;
    // Salvage: if JSON failed but we got prose, use it rather than erroring.
    if (!wrapText && clean && clean[0] !== "{") wrapText = clean;
    if (!wrapText) return res.status(200).json({ wrap: null, skipped: "parse_failed" });

    return res.status(200).json({ wrap: wrapText });
  } catch (err) {
    console.error("[week-wrap] error:", err && err.message);
    return res.status(500).json({ error: "Pip is unavailable right now.", detail: err && err.message });
  }
}
