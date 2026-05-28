import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 20;

// Per-field caps so a single call can't blow up Anthropic spend.
var MAX_FIELD_CHARS    = 8000;   // any single user-supplied string
var MAX_MEETINGS       = 20;     // account-mode array cap
var MAX_TOTAL_CHARS    = 60000;  // hard ceiling across the whole request body

function clampString(s, max) {
  if (typeof s !== "string") return s;
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function clampMeeting(m) {
  if (!m || typeof m !== "object") return m;
  return Object.assign({}, m, {
    title:          clampString(m.title || "", 300),
    notes:          clampString(m.notes || "", MAX_FIELD_CHARS),
    talking_points: clampString(m.talking_points || "", MAX_FIELD_CHARS),
    action_items:   clampString(m.action_items || "", MAX_FIELD_CHARS),
    commitments:    clampString(m.commitments || "", MAX_FIELD_CHARS),
  });
}

function approxBodyChars(body) {
  try { return JSON.stringify(body || {}).length; } catch (e) { return 0; }
}

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

  if (approxBodyChars(req.body) > MAX_TOTAL_CHARS) {
    return res.status(413).json({ error: "Payload too large." });
  }

  var { mode, meeting, accountName, meetings, rangeLabel, account: acct, openItems: bItems, contacts: bContacts, recentDeliveries: bDeliveries, activeProjects: bProjects } = req.body || {};

  // Clamp every user-controlled string so a single call can't be turned into
  // a giant Anthropic spend by sending massive `notes` payloads.
  if (meeting)  meeting  = clampMeeting(meeting);
  if (Array.isArray(meetings)) meetings = meetings.slice(0, MAX_MEETINGS).map(clampMeeting);
  if (acct && acct.name) acct = Object.assign({}, acct, { name: clampString(acct.name, 200) });
  if (accountName) accountName = clampString(accountName, 200);
  if (rangeLabel)  rangeLabel  = clampString(rangeLabel, 80);
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

    if (mode === "brief") {
      var bMeetings = meetings || [];
      var lastMeeting = bMeetings.length > 0 ? bMeetings[0] : null;
      var briefPrompt =
        "You are Pip. Give me a quick pre-call brief for " + (acct ? acct.name : "this account") + ".\n\n" +
        "Format:\n" +
        "1. **Last time** — what happened at the last meeting (or flag if it's been a while)\n" +
        "2. **Open items** — anything outstanding they committed to or you committed to\n" +
        "3. **Recent deliveries** — what's been completed for this account (skip if none)\n" +
        "4. **Who you're seeing** — contacts list\n" +
        "5. **Walk in knowing** — one sharp observation or thing to watch for\n\n" +
        "Keep it tight — this is a parking lot read, not a novel. Max 5 short paragraphs.\n\n" +
        (lastMeeting ? "Last meeting (" + lastMeeting.meeting_date + "): " + (lastMeeting.title || "Untitled") + "\n" +
          (lastMeeting.notes ? "Notes: " + lastMeeting.notes + "\n" : "") +
          (lastMeeting.action_items ? "Action items: " + lastMeeting.action_items + "\n" : "") +
          (lastMeeting.follow_up_date ? "Follow-up date: " + lastMeeting.follow_up_date + "\n" : "") : "No meetings logged yet.\n") +
        "\nOpen items: " + ((bItems || []).filter(function (i) { return !i.done; }).map(function (i) { return i.text + (i.due_date ? " (due " + i.due_date + ")" : ""); }).join("; ") || "None") + "\n" +
        "Contacts: " + ((bContacts || []).map(function (c) { return c.name + (c.title ? " (" + c.title + ")" : "") + (c.is_poc ? " [POC]" : ""); }).join(", ") || "None logged")
        + ((bDeliveries && bDeliveries.length > 0) ? "\nRecent deliveries: " + bDeliveries.map(function(d) { return d.title + (d.date ? " (" + d.date + ")" : ""); }).join("; ") : "")
        + ((bProjects && bProjects.length > 0) ? "\nActive Gauge projects: " + bProjects.map(function(p) { return p.title + " [" + p.status.replace("_", " ") + "]" + (p.due_date ? " due " + p.due_date : ""); }).join("; ") : "");

      var briefResponse = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: briefPrompt }],
      });
      return res.status(200).json({ brief: briefResponse.content[0]?.text || "" });
    }

    return res.status(400).json({ error: "Invalid mode" });
  } catch (err) {
    console.error("ask-pip error:", err);
    return res.status(500).json({ error: "Pip is unavailable right now." });
  }
}
