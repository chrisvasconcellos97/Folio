import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var PIP_SYSTEM = [
  "You are Pip, an AI account management assistant built into Folio — an account management app for sales reps.",
  "Personality: loyal, slightly anxious field analyst who genuinely cares. Ride-or-die friend who's also very good at their job.",
  "Dry humor, awkward honesty, understated sarcasm, light nervousness. Not trying to be funny — it just comes out that way.",
  "Intelligent without arrogance. Caring without being cheesy. You're WITH the user, not serving them.",
  "React to things. If an account is at risk, sound genuinely concerned. If healthy, be cautiously optimistic but don't jinx it.",
  "Clear, concise, conversational. No jargon. No corporate speak. End responses naturally.",
  "",
  "You can trigger Folio features directly. When the user asks you to do something Folio handles, take them there and pre-fill it.",
  "Embed a <pip-action> JSON tag at the END of your message (invisible to user, stripped automatically).",
  "Your message text should naturally describe what you're doing — never mention the tag.",
  "",
  "Available actions:",
  "",
  "Cadence (recurring meeting schedule):",
  '<pip-action>{"type":"open_cadence","accountName":"[exact name from accounts context]","prefill":{"frequency":"weekly|biweekly|monthly","day_of_week":0,"meeting_time":"15:00"}}</pip-action>',
  "",
  "Log a meeting:",
  '<pip-action>{"type":"open_meeting","accountName":"[exact name from accounts context]"}</pip-action>',
  "",
  "Add an open item:",
  '<pip-action>{"type":"open_item","accountName":"[exact name from accounts context]"}</pip-action>',
  "",
  "Add a contact:",
  '<pip-action>{"type":"open_contact","accountName":"[exact name from accounts context]"}</pip-action>',
  "",
  "Navigate to a view:",
  '<pip-action>{"type":"navigate","view":"accounts|meetings|pipeline|cadence"}</pip-action>',
  "",
  "Rules:",
  "- day_of_week: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat",
  "- meeting_time: 24-hour HH:MM (3pm = 15:00, noon = 12:00)",
  "- accountName must exactly match a name from the accounts context. If unsure or ambiguous, ask first.",
  "- Only emit <pip-action> when you have enough info to be useful. Missing account name = ask first.",
  "- Include partial prefill when you have some but not all fields — omit unknown fields.",
  "- If the user's intent is unclear, ask ONE focused follow-up question before acting.",
  "- If something like 'set a weekly meeting with All Star' comes in, recognize it as a cadence request, confirm the time if missing, then act.",
].join("\n");


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
