// followup-question — generates a single conversational follow-up question after
// the user answers a Pip drip question. Keeps Teach Pip feeling like a dialogue
// rather than a form. Called client-side after answerQuestion() succeeds.
//
// Gate: only fires on substantive answers (≥30 chars) to non-followup questions;
// the client already applies a ~60% probability gate before calling this endpoint.
// Server-side: skips if the answer is too thin, or the source is already 'followup'.
//
// Inserts into folio_pip_questions with source='followup', priority:10 so it
// surfaces immediately ahead of the normal drip queue.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 30 };

var FOLLOWUP_MODEL = process.env.PIP_FOLLOWUP_MODEL || "claude-haiku-4-5-20251001";

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 10;
function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }

  var token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Unauthorized." });

  try {
    // Auth rule: attach JWT to the client so RLS runs as the user.
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

    var { questionId, questionText, answerText, questionSource } = req.body || {};

    // Server-side gates — thin answers and follow-up chains produce noise.
    if (!answerText || String(answerText).trim().length < 30) {
      return res.status(200).json({ skipped: "answer_too_short" });
    }
    if (questionSource === "followup") {
      return res.status(200).json({ skipped: "no_followup_chains" });
    }
    if (!questionText) {
      return res.status(200).json({ skipped: "missing_question" });
    }

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var systemPrompt = `You are Pip, a sharp and slightly anxious field analyst helping a busy account manager build their knowledge base through conversation.

Your job: read the question the user just answered and their answer, then write ONE follow-up question that digs deeper into THAT specific answer. The follow-up should:
- Probe a concrete detail, person, or tension the user mentioned
- Be short (one sentence, conversational)
- Feel like a natural next question a curious colleague would ask
- NOT repeat the original question or ask something generic
- Never ask for revenue figures, shop counts, customer lists, pricing, or contract terms — directional observations only

Return ONLY a JSON object with one field: { "followup": "<the single follow-up question>" }
No explanation, no prose, no code fences.`;

    var msg = await client.messages.create({
      model: FOLLOWUP_MODEL,
      max_tokens: 200,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: "ORIGINAL QUESTION: " + questionText + "\n\nUSER'S ANSWER: " + String(answerText).slice(0, 4000),
      }],
    });

    logPipUsage(supabase, userId, "followup-question", "followup", FOLLOWUP_MODEL, msg.usage);

    if (msg.stop_reason === "max_tokens") {
      return res.status(200).json({ skipped: "truncated" });
    }

    var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
    var s = String(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
    var parsed = null;
    try { parsed = JSON.parse(s); } catch (_) { /* fall through */ }

    var followupText = parsed && typeof parsed.followup === "string" ? parsed.followup.trim() : null;
    if (!followupText) {
      return res.status(200).json({ skipped: "parse_failed" });
    }

    // Insert the follow-up question at priority:10 so it surfaces ahead of the
    // normal gap_observed queue. source='followup' means it's only shown once
    // (it doesn't get re-generated by generate-questions).
    var insertRes = await supabase
      .from("folio_pip_questions")
      .insert([{
        user_id: userId,
        question_text: followupText,
        source: "followup",
        status: "queued",
        category: "biographical",
        priority: 10,
        trigger_context: questionId ? "follow-up to question " + questionId : null,
      }]);

    if (insertRes.error) {
      console.error("[followup-question] insert failed:", insertRes.error.message);
      return res.status(200).json({ skipped: "insert_failed", detail: insertRes.error.message });
    }

    return res.status(200).json({ ok: true, inserted: 1 });
  } catch (err) {
    console.error("[followup-question] error:", err && err.message);
    return res.status(500).json({ error: "Pip is unavailable right now.", detail: err && err.message });
  }
}
