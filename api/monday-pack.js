import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

// Monday 1:1 pack — the ONE Sonnet call (Phase 2 #1 "SHINE").
//
// Everything else in the pack is deterministic (src/lib/mondayPack.js). This
// endpoint does the two things that need a model: (0) a short "read" framing the
// week, and (2) extracting the boss's open asks from the last 1:1's notes and
// pre-answering each against the current state passed in. ~1 call/week — the
// client fingerprint-gates it (F3), so a quiet week never reaches here.

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 6;

function isRateLimited(userId) {
  var now = Date.now();
  var ts = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (ts.length >= MAX_REQUESTS) return true;
  ts.push(now);
  rateLimitMap.set(userId, ts);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  var user = null;
  var userClient = null;
  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
    userClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });
  } catch (authErr) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (isRateLimited(user.id)) return res.status(429).json({ error: "rate_limited" });

  try {
    var { lastOneOnOne, leadershipTasks, currentState, personName, profileProse, facts } = req.body || {};
    leadershipTasks = (leadershipTasks || []).slice(0, 15);
    currentState = typeof currentState === "string" ? currentState.slice(0, 6000) : "";

    // Build the user-message context (the cached system block stays byte-stable).
    var ctxParts = [];
    if (typeof profileProse === "string" && profileProse.trim()) {
      ctxParts.push("WHO THIS PERSON IS:\n" + profileProse.trim());
    }
    if (Array.isArray(facts) && facts.length) {
      ctxParts.push("WHAT YOU'VE LEARNED (their vocabulary — use it, don't ask):\n" +
        facts.slice(0, 15).map(function (f) { return "- " + f; }).join("\n"));
    }
    if (lastOneOnOne && (lastOneOnOne.notes || lastOneOnOne.summary)) {
      var oneBits = ["LAST 1:1 (" + (lastOneOnOne.date || "recent") + ")" +
        (personName ? " with " + personName : "") + ":"];
      if (lastOneOnOne.notes)   oneBits.push("Notes:\n" + lastOneOnOne.notes);
      if (lastOneOnOne.summary) oneBits.push("Pip's summary:\n" + lastOneOnOne.summary);
      ctxParts.push(oneBits.join("\n"));
    } else {
      ctxParts.push("LAST 1:1: none captured yet (no notes from a prior 1:1).");
    }
    if (leadershipTasks.length) {
      ctxParts.push("YOUR OPEN 1:1 / LEADERSHIP TASKS (your own to-dos from these 1:1s):\n" +
        leadershipTasks.map(function (t) { return "- " + (t.title || "—") + (t.due ? " (due " + t.due + ")" : ""); }).join("\n"));
    }
    ctxParts.push("CURRENT STATE THIS WEEK (use this to answer 'where are we on X'):\n" +
      (currentState || "(quiet week — nothing notable moved)"));

    var systemPrompt = `You are Pip — a sharp, slightly dry, loyal field analyst prepping your account manager for their weekly 1:1 with their boss. The job: make sure NOTHING surprises them in that meeting. Two outputs.

(1) "read" — 1 to 3 sentences framing the week for the 1:1. What's the headline going in? Lead with anything that could put them on the back foot (a slipped promise, a stalled project the boss cares about). If it was a clean week, say so plainly — don't manufacture drama. Talk like a trusted colleague, not a report. Name specific accounts. No corporate filler.

(2) "boss_asks" — the boss's OPEN asks, pre-answered. Read the LAST 1:1 notes/summary and the open leadership tasks. Pull out anything the boss asked about, assigned, or wanted an update on ("where are we on X", "is Y happy", "handle this"). For each, state the CURRENT status using the CURRENT STATE provided — so the AM walks in with the answer ready. If the last 1:1 has no notes, or nothing was asked, return an empty array. Do NOT invent asks. Each item:
{
  "ask": "the boss's ask, in a few words (e.g. 'Where are we on the Gerber integration?')",
  "status": "the current answer, directional (e.g. 'Moving — waiting on legal sign-off since last week.'). If you genuinely can't tell from the current state, say 'No movement logged this week — worth a status check.'",
  "account": "the account name if it's about one specific account, else null"
}

DATA LINE (hard rule — compliance critical): NEVER ask for or output revenue, transaction volumes, customer/shop counts, shop lists, pricing, or contract terms. Keep everything DIRECTIONAL ("trending up", "volume healthy", "waiting on them") — never a number. This is the AM's personal notebook; the boss's numbers live elsewhere.

Voice: direct, a little dry, genuinely invested. Vary sentence length. Don't pad.

Return ONLY valid JSON: { "read": "...", "boss_asks": [...] }`;

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var model = process.env.PIP_MONDAY_PACK_MODEL || "claude-sonnet-4-6";
    var msg = await client.messages.create({
      model: model,
      max_tokens: 1100,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: ctxParts.join("\n\n") }],
    });

    logPipUsage(userClient, user.id, "monday-pack", "monday-pack", model, msg.usage);

    var raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // Never leak raw JSON. Salvage the read + asks via regex.
      var readMatch = raw.match(/"read"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      var asksMatch = raw.match(/"boss_asks"\s*:\s*(\[[\s\S]*?\](?=\s*\}))/);
      var salvRead  = readMatch
        ? readMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim()
        : "";
      var salvAsks  = [];
      if (asksMatch) { try { salvAsks = JSON.parse(asksMatch[1]); } catch (e2) { salvAsks = []; } }
      parsed = { read: salvRead, boss_asks: salvAsks };
    }

    return res.status(200).json({
      read:      parsed.read || "",
      boss_asks: Array.isArray(parsed.boss_asks) ? parsed.boss_asks.slice(0, 12) : [],
    });
  } catch (e) {
    console.error("[monday-pack]", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
