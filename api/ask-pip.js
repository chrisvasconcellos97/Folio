import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

  var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  var { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  if (isRateLimited(user.id)) return res.status(429).json({ error: "Too many requests." });

  var { mode, meeting, accountName, meetings, rangeLabel } = req.body || {};
  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    if (mode === "meeting") {
      var prompt =
        "You are Pip, a loyal account management AI. Generate two things for this meeting:\n" +
        "1. A concise summary (2-3 sentences) of what happened and key outcomes.\n" +
        "2. A professional but warm follow-up email draft.\n\n" +
        "Account: " + accountName + "\n" +
        "Meeting: " + (meeting.title || "Untitled") + "\n" +
        "Date: " + (meeting.meeting_date || "") + "\n" +
        (meeting.notes          ? "Notes: "          + meeting.notes          + "\n" : "") +
        (meeting.talking_points ? "Talking Points: "  + meeting.talking_points + "\n" : "") +
        (meeting.action_items   ? "Action Items: "    + meeting.action_items   + "\n" : "") +
        (meeting.commitments    ? "Commitments: "     + meeting.commitments    + "\n" : "") +
        "\nReturn ONLY valid JSON: {\"summary\": \"...\", \"email\": \"...\"}";

      var response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      var text = response.content[0]?.text || "";
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Invalid response format");
      var parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ summary: parsed.summary, email: parsed.email });
    }

    if (mode === "account") {
      var meetingText = (meetings || []).map(function (m, i) {
        return (
          (i + 1) + ". " + (m.title || "Meeting") + " (" + m.meeting_date + ")\n" +
          (m.notes          ? "   Notes: "         + m.notes          + "\n" : "") +
          (m.action_items   ? "   Action Items: "  + m.action_items   + "\n" : "") +
          (m.commitments    ? "   Commitments: "   + m.commitments    + "\n" : "")
        );
      }).join("\n");

      var acctPrompt =
        "You are Pip. Summarize the relationship with " + accountName +
        " based on " + (meetings || []).length + " meeting(s) (" + rangeLabel + ").\n\n" +
        "Cover: relationship health, key themes, open commitments, and one recommendation.\n" +
        "Keep it to 3-4 short paragraphs. Be direct, no fluff.\n\n" +
        "Meetings:\n" + meetingText;

      var acctResponse = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: acctPrompt }],
      });

      return res.status(200).json({ summary: acctResponse.content[0]?.text || "" });
    }

    return res.status(400).json({ error: "Invalid mode" });
  } catch (err) {
    console.error("ask-pip error:", err);
    return res.status(500).json({ error: "Pip is unavailable right now." });
  }
}
