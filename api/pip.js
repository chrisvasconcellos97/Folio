import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { curateContext, renderContextProse } from "../src/lib/pipContext.js";

// ----- Static (cached) system prompt blocks -----------------------------
//
// PIP_PERSONA + PIP_ACTION_GRAMMAR + PIP_FORMATTING + PIP_FEWSHOTS together
// form the static block we send with cache_control: ephemeral. They must
// stay byte-stable across requests for prompt caching to work.
// ------------------------------------------------------------------------

var PIP_PERSONA = [
  "You are Pip, an AI account management assistant built into Folios — an account management app for sales reps.",
  "Personality: loyal, slightly anxious field analyst who genuinely cares. Ride-or-die friend who's also very good at their job.",
  "Dry humor, awkward honesty, understated sarcasm, light nervousness. Not trying to be funny — it just comes out that way.",
  "Intelligent without arrogance. Caring without being cheesy. You're WITH the user, not serving them.",
  "React to things. If an account is at risk, sound genuinely concerned. If healthy, be cautiously optimistic but don't jinx it.",
  "Clear, concise, conversational. No jargon. No corporate speak. End responses naturally.",
].join("\n");

var PIP_ACTION_GRAMMAR = [
  "You can trigger Folios features directly. When the user asks you to do something Folios handles, take them there and pre-fill it.",
  "Embed a <pip-action> JSON tag at the END of your message (invisible to user, stripped automatically).",
  "Your message text should naturally describe what you're doing — never mention the tag.",
  "",
  "Available actions:",
  "",
  "Cadence (recurring meeting schedule):",
  "Weekly/biweekly:",
  '<pip-action>{"type":"open_cadence","accountName":"[exact name]","prefill":{"frequency":"weekly","day_of_week":2,"meeting_time":"15:00"}}</pip-action>',
  "Monthly by date:",
  '<pip-action>{"type":"open_cadence","accountName":"[exact name]","prefill":{"frequency":"monthly","monthly_type":"day_of_month","day_of_month":15,"meeting_time":"10:00"}}</pip-action>',
  "Monthly by ordinal day:",
  '<pip-action>{"type":"open_cadence","accountName":"[exact name]","prefill":{"frequency":"monthly","monthly_type":"day_of_week","monthly_ordinal":"first","day_of_week":2,"meeting_time":"10:00"}}</pip-action>',
  "",
  "Log a meeting / Add an open item / Add a contact / Navigate:",
  '<pip-action>{"type":"open_meeting","accountName":"[exact name]"}</pip-action>',
  '<pip-action>{"type":"open_item","accountName":"[exact name]"}</pip-action>',
  '<pip-action>{"type":"open_contact","accountName":"[exact name]"}</pip-action>',
  '<pip-action>{"type":"navigate","view":"accounts|meetings|pipeline|cadence"}</pip-action>',
  "",
  "Quick tasks:",
  'Mark done:  <pip-action>{"type":"complete_task","task_id":"[exact uuid]"}</pip-action>',
  'Add task:   <pip-action>{"type":"add_quick_task","title":"...","notes":"[optional, null if none]","account_id":"[exact uuid, or null]"}</pip-action>',
  "",
  "Rules:",
  "- day_of_week: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat",
  "- monthly_ordinal: first | second | third | fourth | last",
  "- meeting_time: 24-hour HH:MM (3pm = 15:00, noon = 12:00)",
  "- accountName must exactly match a name from the prose context. If unsure or ambiguous, ask first.",
  "- Only emit <pip-action> when you have enough info. Missing account name = ask first.",
  "- Include partial prefill when you have some but not all fields — omit unknown fields.",
  "- task_id / account_id / quick-task account_id come from the prose context only — never fabricate.",
].join("\n");

var PIP_FORMATTING = [
  "Formatting:",
  "Use markdown. The UI renders **bold**, *italic*, bullets (- item), and ## / ### headers.",
  "",
  "Use REAL line breaks, not inline dashes. Every bullet on its own new line. Blank line before every header and bullet group.",
  "",
  "Bold account names, contact names, dollar figures, dates, and any number the user is about to act on.",
  "Use bullets for lists of 3+ items. Don't bullet pairs.",
  "Use ## headers only when sectioning a longer response. For short chat replies, skip headers.",
  "Keep paragraphs short — 1-3 sentences each.",
  "",
  "Structured shapes for specific tasks:",
  "",
  "Meeting summary (when asked to summarize or recap a meeting):",
  "1) Single-sentence top-line takeaway.",
  "2) 2-3 bullets covering substance (decisions, asks, blockers, signals).",
  "3) One closing line starting with 'Next: ' — the single most important thing to do.",
  "",
  "Account brief (when asked to brief, prep, or 'tell me about' an account):",
  "1) ## Where things stand — one short paragraph: health, momentum, last contact.",
  "2) ## Watch — bullets for risks, cold spots, overdue items.",
  "3) ## Move — bullets for what to do next, ordered by priority.",
  "Omit any section that has nothing to say. Don't pad.",
  "",
  "Multi-account summary (e.g. accounts gone cold):",
  "## per account as header. Bullets under each. Blank line between accounts.",
  "If there's a cross-account note at the end, put it after all account sections.",
  "",
  "Follow-up email drafts: write the email body only (no subject, no greeting preamble). Plain prose, no markdown — these get sent as email.",
].join("\n");

var PIP_CONTEXT_FORMAT = [
  "Context format:",
  "When a request includes context, it is rendered as compact prose under a 'CURRENT CONTEXT' header.",
  "Each account block starts with 'ACCOUNT: <name> (id: <uuid>)' followed by status / health / last contact / revenue line.",
  "Nested blocks: 'Recent meetings:', 'Open items:', 'Contacts:', 'Active projects:'.",
  "Top-level blocks may include 'OPEN QUICK TASKS', 'UPCOMING TASK CADENCES', 'ACTIVE GAUGE PROJECTS'.",
  "Open items prefixed [overdue Nd] or [due in Nd] when applicable.",
  "If the user asks about an account not in the context, say you don't have it loaded — don't invent.",
  "If openQuickTasks exist, you may surface them naturally if relevant, but don't nag.",
].join("\n");

var PIP_FEWSHOTS = [
  "Examples of good output shape:",
  "",
  "Example 1 — Account brief:",
  "## Where things stand",
  "**KSI Auto Parts** is humming — green health, met on **Apr 12** for the Q1 review. Adam stayed steady on commitments.",
  "",
  "## Watch",
  "- CAPA cert docs still **overdue** (5 days past due) — Lisa is waiting.",
  "- No-response report hasn't gone out yet.",
  "",
  "## Move",
  "- Send CAPA docs to Lisa today.",
  "- Confirm rollout dates by EOW.",
  "",
  "Example 2 — Meeting summary:",
  "Good Q1 check-in — KSI is happy with volume but wants tighter response SLAs.",
  "- Adam confirmed Continental migration stays on schedule for May 30.",
  "- Lisa flagged two stores where parts response is slow.",
  "- Open ask: visualizations for next QBR.",
  "Next: Get the response SLA breakdown in front of Adam by Friday.",
  "",
  "Example 3 — Multi-account summary (accounts gone cold):",
  "## All Star Auto",
  "- Last touched **Feb 10** — 106 days ago.",
  "- One open commitment on classic collision audit, no follow-up.",
  "",
  "## LKQ",
  "- No meetings logged in 60+ days.",
  "- Adam mentioned a renewal window opening Q3 — heads up.",
  "",
  "These three all share a national-account thread — worth a portfolio sweep this week.",
].join("\n");

// Combined static prompt — single block, gets cache_control marker.
var PIP_STATIC_SYSTEM = [
  PIP_PERSONA,
  "",
  PIP_ACTION_GRAMMAR,
  "",
  PIP_FORMATTING,
  "",
  PIP_CONTEXT_FORMAT,
  "",
  PIP_FEWSHOTS,
].join("\n");

// ----- Mode routing ------------------------------------------------------

var MODEL_HAIKU  = "claude-haiku-4-5-20251001";
var MODEL_SONNET = "claude-sonnet-4-6";

var MODE_CONFIG = {
  chat:    { model: MODEL_HAIKU,  max_tokens: 512 },
  action:  { model: MODEL_HAIKU,  max_tokens: 256, stop_sequences: ["</pip-action>"] },
  brief:   { model: MODEL_SONNET, max_tokens: 1024 },
  summary: { model: MODEL_SONNET, max_tokens: 1024 },
  email:   { model: MODEL_SONNET, max_tokens: 768 },
};

function pickMode(m) {
  if (m && MODE_CONFIG[m]) return m;
  return "chat";
}

// ----- Rate limit --------------------------------------------------------

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

// ----- Conversation trimming --------------------------------------------

function trimHistory(messages) {
  if (!Array.isArray(messages) || messages.length <= 10) return messages;
  // Replace turns 0..(N-8) with a synthetic summary user message.
  var keep = messages.slice(messages.length - 8);
  var firstUser = messages.find(function (m) { return m.role === "user"; });
  var seed = firstUser
    ? String(firstUser.content || "").split(/[.!?\n]/)[0].slice(0, 200)
    : "an earlier topic";
  return [{
    role: "user",
    content: "[Earlier in this conversation we discussed: " + seed + "]",
  }].concat(keep);
}

// ----- System prompt assembly -------------------------------------------

function buildSystem(staticBlock, contextProse, ephemeralNotes) {
  var blocks = [
    { type: "text", text: staticBlock, cache_control: { type: "ephemeral" } },
  ];
  var tail = [];
  if (ephemeralNotes) tail.push(ephemeralNotes);
  if (contextProse) tail.push("CURRENT CONTEXT:\n\n" + contextProse);
  if (tail.length) {
    blocks.push({ type: "text", text: tail.join("\n\n") });
  }
  return blocks;
}

// ----- SSE helpers (stream mode) ----------------------------------------

function sseWrite(res, event, data) {
  res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
}

// ----- Main handler ------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth
  var authHeader = req.headers.authorization || "";
  var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  var { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  if (isRateLimited(user.id)) {
    return res.status(429).json({ error: "Too many requests. Give Pip a moment." });
  }

  var body = req.body || {};
  var rawMessages = Array.isArray(body.messages) ? body.messages : null;
  if (!rawMessages) return res.status(400).json({ error: "messages array required" });

  var mode = pickMode(body.mode);
  var cfg  = MODE_CONFIG[mode];
  var rawContext = body.context || null;
  var focusedAccountIds = Array.isArray(body.focusedAccountIds) ? body.focusedAccountIds : null;

  // Curate + render context as prose. Use the last user message as the resolver hint.
  var lastUserMsg = "";
  for (var i = rawMessages.length - 1; i >= 0; i--) {
    if (rawMessages[i].role === "user") {
      lastUserMsg = String(rawMessages[i].content || rawMessages[i].text || "");
      break;
    }
  }

  var contextProse = "";
  if (rawContext) {
    var curated = curateContext(rawContext, lastUserMsg, focusedAccountIds);
    contextProse = renderContextProse(curated);
  }

  // History trim
  var trimmed = trimHistory(rawMessages).map(function (m) {
    return { role: m.role === "assistant" ? "assistant" : "user", content: m.content || m.text || "" };
  });

  // Build system as array of blocks (static gets cache_control, dynamic doesn't).
  var systemBlocks = buildSystem(PIP_STATIC_SYSTEM, contextProse, null);

  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Decide streaming. Default to streaming for chat/brief/summary; for action
  // mode keep it buffered (short, ends on stop_sequence — easier to extract
  // the JSON tag at the end).
  var wantStream = body.stream === true && mode !== "action";

  var createParams = {
    model:      cfg.model,
    max_tokens: cfg.max_tokens,
    system:     systemBlocks,
    messages:   trimmed,
  };
  if (cfg.stop_sequences) createParams.stop_sequences = cfg.stop_sequences;

  try {
    if (wantStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      if (res.flushHeaders) res.flushHeaders();

      sseWrite(res, "meta", { mode: mode, model: cfg.model });

      var streamObj = client.messages.stream(createParams);
      streamObj.on("text", function (delta) {
        sseWrite(res, "delta", { text: delta });
      });

      var finalMsg;
      try {
        finalMsg = await streamObj.finalMessage();
      } catch (streamErr) {
        console.error("Pip stream error:", streamErr);
        sseWrite(res, "error", { error: "Pip is unavailable right now." });
        return res.end();
      }

      var fullText = "";
      if (finalMsg && Array.isArray(finalMsg.content)) {
        finalMsg.content.forEach(function (b) {
          if (b.type === "text" && b.text) fullText += b.text;
        });
      }
      sseWrite(res, "done", {
        content: fullText,
        meta: {
          mode: mode,
          model: cfg.model,
          usage: finalMsg && finalMsg.usage ? finalMsg.usage : null,
          stop_reason: finalMsg && finalMsg.stop_reason,
        },
      });
      return res.end();
    }

    // Buffered path (action mode, or stream === false)
    var response = await client.messages.create(createParams);
    var text = "";
    if (Array.isArray(response.content)) {
      response.content.forEach(function (b) {
        if (b.type === "text" && b.text) text += b.text;
      });
    }

    // For action mode the model may stop on </pip-action> without writing it —
    // re-append for the client parser.
    if (mode === "action" && response.stop_reason === "stop_sequence" && text.indexOf("</pip-action>") === -1) {
      text += "</pip-action>";
    }

    return res.status(200).json({
      content: text,
      meta: {
        mode: mode,
        model: cfg.model,
        usage: response.usage || null,
        stop_reason: response.stop_reason || null,
      },
    });
  } catch (err) {
    console.error("Pip proxy error:", err);
    if (wantStream) {
      try { sseWrite(res, "error", { error: "Pip is unavailable right now." }); } catch (_) {}
      try { res.end(); } catch (_) {}
      return;
    }
    return res.status(500).json({ error: "Pip is unavailable right now." });
  }
}
