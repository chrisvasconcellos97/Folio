import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage, overDailySpendCap } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

// In-memory per-user rate limit: 5 requests per 60-second window.
var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 5;

function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

var MODEL_HAIKU  = "claude-haiku-4-5-20251001";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }
  try {
    var authHeader = req.headers.authorization || "";
    var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    if (isRateLimited(user.id)) return res.status(429).json({ error: "rate_limited" });

    // new Anthropic(...) INSIDE the try-catch as the first statement after auth
    // (Vercel Serverless Function Rule — never at module level or outside try).
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var body   = req.body || {};
    var pairs  = Array.isArray(body.pairs) ? body.pairs : [];

    if (pairs.length === 0) {
      return res.status(400).json({ error: "No Q&A pairs provided." });
    }

    // Degrade to Haiku if daily spend cap exceeded.
    var overCap       = await overDailySpendCap(supabase, user.id);
    var MODEL_SONNET  = process.env.PIP_PROFILE_MODEL || "claude-sonnet-4-6";
    var profileModel  = overCap ? MODEL_HAIKU : MODEL_SONNET;

    var qaText = pairs.map(function (p, i) {
      return "Q" + (i + 1) + ": " + p.question + "\nA: " + (p.answer || "(skipped)");
    }).join("\n\n");

    var systemPrompt = "You are a profile synthesizer for Pip, an AI field analyst. " +
      "Given a user's answers to onboarding questions, extract structured slot values AND write a concise profile narrative. " +
      "The narrative is injected into every Pip response going forward — make it accurate and useful, not generic fluff. " +
      "Respond with valid JSON only, no markdown fences.";

    var userPrompt = "Here are the user's onboarding answers:\n\n" + qaText + "\n\n" +
      "Return a JSON object with these fields:\n" +
      "- role_title: string or null\n" +
      "- company_name: string or null\n" +
      "- industry: string or null\n" +
      "- portfolio_shape: string or null\n" +
      "- primary_goal: string or null\n" +
      "- working_style: string or null\n" +
      "- profile_prose: a 4-8 sentence narrative (max ~600 chars) written in third person that Pip will read before every response. " +
      "Include: who this person is, their role, company, what they sell, how their book of business looks, what success means to them, and any communication preferences. " +
      "Be specific, not generic. Example: 'Chris is an Account Manager at OEC Group covering ~40 aftermarket automotive distributors across the Midwest and Southeast. He focuses on growing share of wallet on Mid and Major-tier accounts like Parts Authority and LKQ. A good quarter means net-new SKU adoption and no renewals slipping. He prefers concise briefings and his week is busiest Monday through Wednesday.' " +
      "- completeness: integer 0-100 reflecting how complete the profile is based on answers provided";

    var msg = await client.messages.create({
      // Sonnet: this defines how Pip understands WHO YOU ARE — it shapes every
      // downstream output. Runs rarely (onboarding + occasional re-synthesis).
      // Degrades to Haiku when the daily spend cap is exceeded.
      model:      profileModel,
      max_tokens: 1000, // 1000 (was 600): headroom so Sonnet's prose + slots JSON never truncates

      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });
    logPipUsage(supabase, user.id, "profile-synthesis", "synthesis", profileModel, msg.usage);

    var raw = (msg.content && msg.content[0] && msg.content[0].text) || "{}";
    var parsed = {};
    try { parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "")); } catch (e) { /* use empty */ }

    // Detect silent empty-profile failure — if the model returned {} or a
    // near-empty object, surface a real error rather than writing onboarding_done
    // with no actual profile data (which would make detectKnowledgeGaps think the
    // user is set up while Pip actually knows nothing).
    var hasContent = parsed.profile_prose || parsed.role_title || parsed.company_name;
    if (!hasContent) {
      console.error("[profile-synthesis] model returned empty or unparseable profile; raw:", String(raw).slice(0, 300));
      return res.status(502).json({ error: "Profile synthesis produced no content — please retry." });
    }

    // Always include onboarding_status: "done" so clients can apply it in one
    // upsert without needing a separate fallback. detectKnowledgeGaps gates on
    // this field — if it's missing from the profile row, gap drip never fires.
    parsed.onboarding_status = "done";

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("profile-synthesis error:", err);
    return res.status(500).json({ error: "Profile synthesis unavailable.", detail: err && err.message });
  }
}
