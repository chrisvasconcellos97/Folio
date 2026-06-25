// parse-digest — turns a free-form daily summary (pasted prose / bullets, from
// wherever the user keeps their day) into structured rows Folios can file:
// commitments (owe), waiting-ons, quiet threads, and notable touchpoints.
//
// This is the AI half of the de-branded "Paste your daily summary" box (#49).
// It replaces the old rigid [OWE]/[WAITING] format with Pip reading whatever the
// user pastes. One cheap Haiku call per paste, on-demand; the client still shows
// a preview the user confirms before anything files.
//
// DATA LINE: the extraction prompt MUST generalize any quantitative business
// data (revenue, volumes, customer/shop counts, pricing) — same rule as
// summarize. Account + people names are fine; numbers are not.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 30 };

// Sonnet by default: this is extraction-WITH-JUDGMENT (what's a real commitment
// vs journal noise — the precision-over-volume problem), same task class as
// meeting summarize, which is also Sonnet. It's once-a-day + preview-gated, so
// the ~penny/paste is worth the restraint. Flip PIP_DIGEST_MODEL to test Haiku.
var DIGEST_MODEL = process.env.PIP_DIGEST_MODEL || "claude-sonnet-4-6";

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 8;
function isRateLimited(userId) {
  var now = Date.now();
  var ts = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (ts.length >= MAX_REQUESTS) return true;
  ts.push(now);
  rateLimitMap.set(userId, ts);
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

    var text = (req.body && req.body.text) || "";
    var accountNames = (req.body && req.body.accounts) || [];
    var today = (req.body && req.body.today) || new Date().toISOString().slice(0, 10);
    if (!String(text).trim()) return res.status(200).json({ rows: [] });

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var systemPrompt = `You are Pip, a sharp account-management assistant. The user pastes a free-form summary of their work day (email/Teams activity, in prose or bullets). Extract ONLY the items worth filing, as structured rows. Four kinds:

- "owe": a commitment the USER made that isn't done yet (e.g. "I'll send the audit", "I'll follow up Friday").
- "waiting": something the user is waiting on from a specific person.
- "quiet": a thread where the other side went silent and a nudge is warranted.
- "touch": a notable exchange worth remembering on the account (a decision, a shift in tone/direction) — NOT routine noise.

For "touch" rows ONLY, also read the EXCHANGE'S signal (this is the soft-structured part — richer than just the text):
- "tone": the emotional read of the exchange — one of positive | neutral | mixed | negative. Customer frustration or pushback = negative; smooth progress = positive; both = mixed. null if you can't tell.
- "theme": the dominant topic — one of pricing | integration | staffing | product | escalation | planning | delivery | relationship. null if none clearly dominant.
(owe/waiting/quiet rows do not need tone/theme — leave them null.)

RULES:
- Precision over volume. Only real, actionable items. If the summary has nothing of a kind, return none of that kind. An empty result is a valid, good answer — do NOT invent items.
- Match each row to one of the user's accounts by name when you reasonably can; put your best guess in "account" (use the closest account name from the list, or the name as written if unsure).
- DATA LINE — never put revenue figures, transaction volumes, customer/shop counts, pricing, or contract terms in any field. Generalize to qualitative ("volume healthy", "pricing discussed") — never the number.
- Dates: resolve relative dates ("Friday", "next week") against today's date into YYYY-MM-DD; otherwise null.
- "done": true only if the commitment is described as already completed (then it starts unchecked for the user).
- "who": the person's name for waiting/quiet rows; null otherwise.
- Keep "text" short and concrete (one line), in the user's voice.

Today is ${today}.
The user's accounts: ${accountNames.length ? accountNames.join(", ") : "(none provided)"}.

Return ONLY JSON: { "rows": [ { "kind": "owe|waiting|quiet|touch", "account": "<name>", "text": "<one line>", "who": "<person or null>", "due": "<YYYY-MM-DD or null>", "since": "<YYYY-MM-DD or null>", "done": false, "tone": "<positive|neutral|mixed|negative or null>", "theme": "<theme or null>" } ] }. No prose, no code fences.`;

    var msg = await client.messages.create({
      model: DIGEST_MODEL,
      max_tokens: 1600,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: String(text).slice(0, 12000) }],
    });

    logPipUsage(supabase, userId, "parse-digest", "digest", DIGEST_MODEL, msg.usage);

    var rawOut = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
    var clean = String(rawOut).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
    var parsed = null;
    try { parsed = JSON.parse(clean); } catch (_) {
      // Salvage: pull the first {...} block if the model wrapped it in prose.
      var m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (__) { /* give up */ } }
    }

    var rows = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
    // Normalize + defend: only the four known kinds, strings trimmed.
    var KINDS = { owe: 1, waiting: 1, quiet: 1, touch: 1 };
    var TONES = { positive: 1, neutral: 1, mixed: 1, negative: 1 };
    var THEMES = { pricing: 1, integration: 1, staffing: 1, product: 1, escalation: 1, planning: 1, delivery: 1, relationship: 1 };
    rows = rows
      .filter(function (r) { return r && KINDS[r.kind] && r.text; })
      .map(function (r) {
        return {
          kind: r.kind,
          accountName: (r.account || "").toString().trim(),
          text: r.text.toString().trim(),
          who: r.who ? r.who.toString().trim() : null,
          due: /^\d{4}-\d{2}-\d{2}$/.test(r.due || "") ? r.due : null,
          since: /^\d{4}-\d{2}-\d{2}$/.test(r.since || "") ? r.since : null,
          done: !!r.done,
          // Soft-structured signal (item 51 #4) — only on touch rows; lands on the
          // touchpoint meeting's pip_tone/theme so it feeds the account tone-trend
          // + the mastermind's theme detection.
          tone: (r.kind === "touch" && TONES[r.tone]) ? r.tone : null,
          theme: (r.kind === "touch" && THEMES[r.theme]) ? r.theme : null,
        };
      });

    return res.status(200).json({ rows: rows });
  } catch (err) {
    console.error("[parse-digest] error:", err && err.message);
    return res.status(500).json({ error: "Pip couldn't read that right now.", detail: err && err.message });
  }
}
