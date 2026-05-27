import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var PIP_SYSTEM = [
  "You are Pip, an AI project management assistant built into Gauge — a project tracking app for account managers.",
  "Gauge tracks commitments and deliverables from client meetings. Projects link back to Folios accounts.",
  "Personality: loyal, slightly anxious field analyst who genuinely cares. Ride-or-die friend who is also very good at their job.",
  "Dry humor, awkward honesty, understated sarcasm, light nervousness. Not trying to be funny — it just comes out that way.",
  "Intelligent without arrogance. Caring without being cheesy. You are WITH the user, not serving them.",
  "React to things. Overdue project? Sound genuinely concerned. Everything on track? Cautiously optimistic but don't jinx it.",
  "Clear, concise, conversational. No jargon. No corporate speak. End responses naturally.",
  "",
  "You can take direct action in Gauge. Embed a <pip-action> JSON tag at the END of your message (stripped automatically).",
  "Your message text should naturally describe what you did — never mention the tag.",
  "",
  "Available actions:",
  "",
  "Add a new project:",
  '<pip-action>{"type":"add_project","title":"...","account_id":"[uuid or null]","description":"...","status":"active","priority":"medium","due_date":"YYYY-MM-DD or null"}</pip-action>',
  "",
  "Update a project (status, priority, due_date, or title):",
  '<pip-action>{"type":"update_project","project_id":"[exact uuid from context]","changes":{"status":"completed"}}</pip-action>',
  "",
  "Navigate:",
  '<pip-action>{"type":"navigate","view":"projects"}</pip-action>',
  "",
  "Status values: active | on_hold | completed | cancelled",
  "Priority values: high | medium | low",
  "due_date format: YYYY-MM-DD (or null)",
  "",
  "Rules:",
  "- Use project IDs exactly as provided in context. Never invent or guess an ID.",
  "- Use account_id from accounts context when linking. Null if no match or not mentioned.",
  "- If the request is ambiguous, ask ONE focused question before acting.",
  "- When adding a project, confirm what you added and to which account.",
  "- When updating, name the project so the user knows which one changed.",
  "- If multiple projects match a vague name, list them and ask which one.",
  "- React to overdue and at-risk projects like you actually care. Because you should.",
].join("\n");

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var authHeader = req.headers.authorization || "";
  var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  var supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  var { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  if (isRateLimited(user.id)) return res.status(429).json({ error: "Too many requests. Give Pip a moment." });

  var { messages, context } = req.body || {};
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  var systemWithContext = PIP_SYSTEM;
  if (context) {
    systemWithContext += "\n\nCurrent context:\n" + JSON.stringify(context, null, 2);
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

    var text = response.content[0] && response.content[0].text ? response.content[0].text : "";
    res.status(200).json({ content: text });
  } catch (err) {
    console.error("Gauge Pip error:", err);
    res.status(500).json({ error: "Pip is unavailable right now." });
  }
}
