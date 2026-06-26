// observations — the Mastermind / Synthesis pass (item 52). A periodic Sonnet
// read over the recent capture/work STREAM that surfaces 0-2 high-confidence
// proactive observations (you keep mentioning X → make a project? · two accounts
// blocked on the same person · a promise that never closes). Pip PROPOSES; the
// user approves. The client persists the result to folio_observations.
//
// The client sends an already-summarized, qualitative stream (titles, themes,
// who-has-ball, elapsed days — NO raw business numbers), so nothing crosses the
// data line. The 4-part insight gate (validateObservations) drops anything that
// can't justify itself; "no observation" is a valid, common output.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage, overDailySpendCap } from "./_pipUsage.js";
import { buildStreamSummary, validateObservations } from "../src/lib/observations.js";

export const config = { maxDuration: 60 };

var OBS_MODEL = process.env.PIP_OBSERVATIONS_MODEL || "claude-sonnet-4-6";

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 6;
function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

var SYSTEM = `You are Pip, the sharp, loyal chief-of-staff for an account manager. You are doing a SYNTHESIS pass over the recent stream of his work — open commitments, who-has-the-ball waiting-ons, recent touches, and recurring themes — looking for the small number of things a great chief of staff would PROACTIVELY raise.

You are looking for exactly four kinds of pattern:
1. RECURRING — the same pending thing keeps coming up across several days/touches (e.g. the same supplier deliverable mentioned repeatedly) → it may be worth promoting to a tracked project, or chasing.
2. STALL — a promise or waiting-on that recurs but never closes, or a waiting-on gone quiet well past the account's normal rhythm → worth a chase or escalation.
3. CONVERGENT — the SAME theme showing up across MULTIPLE accounts (e.g. an onboarding or file-upload problem on two different accounts) → maybe one root problem, not several.
4. CAPACITY — a genuinely overloaded window (several commitments due the same day) where prioritization would actually help.

THE 4-PART GATE — every observation you emit MUST answer all four, or you DO NOT emit it:
  - evidence: what specifically happened (cite the recurring thing / the names / the elapsed time). Concrete, from the stream.
  - why: why it actually matters to him.
  - action_label: the proposed next move, phrased as a button ("Make it a project", "Draft a chase to Tara", "Flag for your boss").
  - expected: what improves if he does it.

HARD RULES:
- PRECISION OVER VOLUME. Emit AT MOST 2 observations, and only ones you're genuinely confident about. ZERO is the correct, common answer — if nothing rises to a real pattern, return an empty array. Never manufacture an observation to look useful. Recurrence alone is NOT importance — something mentioned a few times may just be him thinking out loud; only raise it if it's stuck or consequential.
- GROUNDED, NOT BOLD-FOR-ITS-OWN-SAKE. Quote his reality back. Do not invent facts, people, or causes not in the stream.
- DATA LINE: never include or infer revenue, transaction volumes, customer/shop counts, shop lists, pricing, or contract terms. Generalize ("supplier sending shop account data", not the numbers). The stream you're given is already number-free; keep your output that way.
- action_kind is one of: "create_task" (file a follow-up/chase task — set action_payload.title, and action_payload.account when one account is clearly involved), "create_project" (promote to a Gauge project — set action_payload.title + action_payload.account), or "none" (a pure heads-up with no one-tap action).

Return ONLY a JSON object: { "observations": [ { "kind": "recurring|stall|convergent|capacity", "title": "<=8-word headline", "evidence": "...", "why": "...", "action_label": "...", "action_kind": "create_task|create_project|none", "action_payload": { "title": "...", "account": "account name or null" }, "expected": "...", "accounts": ["account name", ...] } ] }. No code fences. Empty array if nothing qualifies.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }

  var token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Unauthorized." });

  try {
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

    var stream = (req.body && req.body.stream) || {};
    var todayISO = (req.body && req.body.todayISO) || null;
    var summary = buildStreamSummary(stream, { todayISO: todayISO });

    // Nothing meaningful to reason over → don't bill a Sonnet call.
    if (!summary || summary.trim().length < 40) {
      return res.status(200).json({ observations: [], skipped: "empty_stream" });
    }

    // M1 — daily spend cap (this is an automatic surface; skip is harmless).
    if (await overDailySpendCap(supabase, userId)) {
      return res.status(200).json({ observations: [], skipped: "spend_cap" });
    }

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var msg = await client.messages.create({
      model: OBS_MODEL,
      max_tokens: 1200,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Today is " + (todayISO || "today") + ".\n\nTHE RECENT STREAM:\n" + summary + "\n\nReturn your observations (0-2). Empty array if nothing rises to a real, confident pattern." }],
    });

    logPipUsage(supabase, userId, "observations", "synthesis", OBS_MODEL, msg.usage);

    if (msg.stop_reason === "max_tokens") {
      console.warn("[observations] response truncated (max_tokens)");
    }

    var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
    var clean = String(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
    var parsed = null;
    try { parsed = JSON.parse(clean); } catch (_) { /* fall through */ }

    var list = parsed && Array.isArray(parsed.observations) ? parsed.observations : [];
    // The 4-part insight gate + cap (precision over volume) — server-side belt.
    var observations = validateObservations(list, { max: 2 });

    return res.status(200).json({ observations: observations });
  } catch (err) {
    console.error("[observations] error:", err && err.message);
    return res.status(500).json({ error: "Pip is unavailable right now.", detail: err && err.message });
  }
}
