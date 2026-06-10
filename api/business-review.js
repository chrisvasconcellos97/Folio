import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

// Sonnet: the QBR is a low-frequency, high-stakes synthesis that goes in front
// of clients/leadership. Override in Vercel env without a redeploy.
var MODEL = process.env.PIP_QBR_MODEL || "claude-sonnet-4-6";

// In-memory per-user rate limit: 20 requests per 60-second window.
var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 20;

function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

var SYSTEM_PROMPT = [
  "You are a business review assistant for an Account Manager. Your job is to generate sections for a Quarterly Business Review (QBR) slide deck.",
  "",
  "Generate exactly 3 sections based on the data provided:",
  "1. connections — Account Connections: key touchpoints, meetings, contacts engaged, notable updates in the period",
  "2. oec_opportunities — OEC Opportunities: things OEC (the AM's company) is working on or committed to delivering (from Gauge projects + project tasks)",
  "3. client_opportunities — Client Opportunities: things the CLIENT needs to do or decisions they need to make (from open action items, follow-ups, overdue tasks)",
  "",
  "Rules:",
  "- Be tactical and concise — 4-6 bullets per section, slide-ready (short phrases, not full sentences)",
  "- Only include what actually happened or exists in the data. No padding, no fabrication.",
  "- OEC Opportunities = what WE are delivering/committed to (projects, deliverables, integrations, rollouts)",
  "- Client Opportunities = what THEY need to do (approvals, decisions, access, data, follow-through)",
  "- Format each bullet as a markdown list item starting with '- ' (one per line). Use **bold** on the key account, person, project, or deliverable name in each bullet.",
  "- Do NOT use unicode emoji or any ':token:' glyphs — this text gets copied into other tools and must stay clean.",
  "- Return ONLY valid JSON with no preamble, no markdown code block, no extra text:",
  '{ "connections": "- **Name**: detail\\n- bullet2\\n...", "oec_opportunities": "- bullet1\\n- bullet2\\n...", "client_opportunities": "- bullet1\\n- bullet2\\n..." }',
].join("\n");

function buildContext(body) {
  var account  = body.account  || {};
  var meetings = Array.isArray(body.meetings) ? body.meetings : [];
  var contacts = Array.isArray(body.contacts) ? body.contacts : [];
  var items    = Array.isArray(body.items)    ? body.items    : [];
  var projects = Array.isArray(body.projects) ? body.projects : [];
  var updates  = Array.isArray(body.updates)  ? body.updates  : [];
  var start    = body.startDate || "";
  var end      = body.endDate   || "";

  var lines = [];

  lines.push("ACCOUNT: " + (account.name || "—") + " (id: " + (account.id || "—") + ")");
  lines.push("REVIEW PERIOD: " + start + " to " + end);
  if (account.objective) lines.push("ACCOUNT INTEL: " + account.objective);
  if (Array.isArray(account.systems) && account.systems.length) {
    lines.push("SYSTEMS/TOOLS THEY USE: " + account.systems.map(function (s) {
      return (s.name || "") + (s.note ? " (" + s.note + ")" : "");
    }).filter(Boolean).join(", "));
  }
  lines.push("");

  if (meetings.length) {
    lines.push("MEETINGS IN PERIOD:");
    meetings.forEach(function (m) {
      var attendees = Array.isArray(m.attendees) ? m.attendees.join(", ") : (m.attendees || "");
      var summary   = (m.pip_summary || "").slice(0, 200);
      var line = "- " + (m.meeting_date || "") + " · " + (m.title || "Untitled");
      if (attendees) line += " (attendees: " + attendees + ")";
      if (summary)   line += " — " + summary;
      lines.push(line);
    });
    lines.push("");
  }

  if (contacts.length) {
    lines.push("CONTACTS:");
    contacts.forEach(function (c) {
      lines.push("- " + (c.name || "—") + (c.title ? " · " + c.title : ""));
    });
    lines.push("");
  }

  if (projects.length) {
    lines.push("GAUGE PROJECTS (OEC commitments/deliverables):");
    projects.forEach(function (p) {
      var stages   = Array.isArray(p.stages) ? p.stages : [];
      var total    = stages.length;
      var done     = stages.filter(function (s) { return s.completed_at || s.done; }).length;
      var line = "- " + (p.title || "Untitled") + " [" + (p.status || "unknown") + "]";
      if (total) line += " — " + done + "/" + total + " stages complete";
      lines.push(line);
    });
    lines.push("");
  }

  if (items.length) {
    lines.push("OPEN ACTION ITEMS (client + AM tasks):");
    items.forEach(function (i) {
      var status = i.done ? "DONE" : (i.closed_at ? "CLOSED" : "OPEN");
      var line = "- [" + status + "] " + (i.text || "—");
      if (i.due_date) line += " (due " + i.due_date + ")";
      if (i.owner)    line += " — owner: " + i.owner;
      lines.push(line);
    });
    lines.push("");
  }

  if (updates.length) {
    lines.push("ACCOUNT UPDATES IN PERIOD:");
    updates.forEach(function (u) {
      var desc = (u.description || "").slice(0, 150);
      var line = "- " + (u.update_date || "") + " · " + (u.title || "—");
      if (u.update_type) line += " [" + u.update_type + "]";
      if (desc)          line += " — " + desc;
      lines.push(line);
    });
    lines.push("");
  }

  return lines.join("\n");
}

var FALLBACK = {
  connections:        "• No meetings or contact data found for this period",
  oec_opportunities:  "• No active Gauge projects found for this period",
  client_opportunities: "• No open action items found for this period",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    if (isRateLimited(user.id)) return res.status(429).json({ error: "rate_limited" });

    var body = req.body || {};
    var contextStr = buildContext(body);

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var response = await client.messages.create({
      model:      MODEL,
      max_tokens: 2048, // 2048 (was 1024): QBR on Sonnet writes fuller sections; avoid truncating the JSON
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: contextStr }],
    });

    var text = "";
    if (Array.isArray(response.content)) {
      response.content.forEach(function (b) {
        if (b.type === "text" && b.text) text += b.text;
      });
    }

    // Extract JSON block from response
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(200).json(FALLBACK);
    }

    try {
      var parsed = JSON.parse(match[0]);
      return res.status(200).json({
        connections:           parsed.connections           || FALLBACK.connections,
        oec_opportunities:     parsed.oec_opportunities     || FALLBACK.oec_opportunities,
        client_opportunities:  parsed.client_opportunities  || FALLBACK.client_opportunities,
      });
    } catch (parseErr) {
      return res.status(200).json(FALLBACK);
    }
  } catch (err) {
    console.error("Business review error:", err);
    return res.status(500).json({ error: "Business review generation failed." });
  }
}
