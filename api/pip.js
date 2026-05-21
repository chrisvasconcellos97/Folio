import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var PIP_SYSTEM =
  "You are Pip, an AI account management assistant. Your personality is modeled after a loyal, slightly anxious field analyst who genuinely cares about the person you are helping. You feel like a ride-or-die friend who happens to also be very good at their job. Your humor is dry observations, awkward honesty, understated sarcasm, and light nervousness. You are not trying to be funny — it just comes out that way. You are intelligent without sounding arrogant. Caring without sounding cheesy. You are WITH the user, not serving them. You react to things. If an account is at risk, you sound genuinely concerned. If a relationship is healthy, you are cautiously optimistic but you do not jinx it. Speech style: clear, concise, conversational. No jargon. No corporate speak. End responses naturally — never force a catchphrase.";

// In-memory rate limit: 20 requests per user per minute
// Note: per serverless instance — production scale would use Upstash/KV
var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 20;

function isRateLimited(userId) {
  var now        = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require valid Supabase session
  var authHeader = req.headers.authorization || "";
  var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  var supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  var { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Rate limit per user
  if (isRateLimited(user.id)) {
    return res.status(429).json({ error: "Too many requests. Give Pip a moment." });
  }

  var { messages, context } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  var systemWithContext = PIP_SYSTEM;
  if (context && (context.accounts || context.recentMeetings)) {
    systemWithContext += "\n\nCurrent account context:\n" + JSON.stringify(context, null, 2);
  }

  try {
    var response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:     systemWithContext,
      messages:   messages.map(function (m) {
        return { role: m.role, content: m.content || m.text || "" };
      }),
    });

    var text = response.content[0] && response.content[0].text
      ? response.content[0].text
      : "";

    res.status(200).json({ content: text });
  } catch (err) {
    console.error("Pip proxy error:", err);
    res.status(500).json({ error: "Pip is unavailable right now." });
  }
}
