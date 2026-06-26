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
- Precision over volume. Only real items. If the summary has nothing of a kind, return none of that kind. An empty result is a valid, good answer — do NOT invent items.
- PRECISION APPLIES TO THE ACTION KINDS (owe / waiting / quiet): only file one when the user made a concrete commitment, is waiting on a specific named person, or a thread genuinely needs a nudge. A topic merely discussed, a status update, or a vague mention with no real next step is NOT an owe/waiting/quiet row — let the "read" (below) carry it. Two precise action rows the user will act on beat ten vague ones they'll ignore. When unsure, leave it OUT and let the read carry it.
- touch rows are DIFFERENT — do NOT suppress them under the precision rule. A genuine decision, or a real shift in tone/direction on an account, SHOULD be a touch row even though it isn't a task — that's how the account remembers what happened (it's logged on the account, with tone/theme). Skip only routine noise. A notable exchange can appear in BOTH the read and as a touch row; that's correct.
- Match each row to one of the user's accounts by name when you reasonably can; put your best guess in "account" (use the closest account name from the list, or the name as written if unsure).
- DATA LINE — never put revenue figures, transaction volumes, customer/shop counts, pricing, or contract terms in any field. Generalize to qualitative ("volume healthy", "pricing discussed") — never the number.
- Dates: resolve relative dates ("Friday", "next week") against today's date into YYYY-MM-DD; otherwise null.
- "done": true only if the commitment is described as already completed (then it starts unchecked for the user).
- "who": the person's name for waiting/quiet rows; null otherwise.
- Keep "text" short and concrete (one line), in the user's voice.

ALSO produce a "read": a short (2-4 sentence) plain-language briefing of the user's day, in their voice, that they can scan in five seconds. Surface what they owe, what they're waiting on, what's gone quiet, and anything that genuinely shifted on an account (a decision, a warming/cooling relationship, a new name worth knowing). This is the PRIMARY output — the rows are just the few items worth filing; the read is where the intelligence lives, so it can mention things that aren't rows. Ground it ONLY in what they actually pasted — never invent. If the day is thin, one honest line is fine ("Quiet day — nothing you owe anyone, still waiting on Mike."). Same DATA LINE applies: no figures, ever.

ALSO produce "account_reads": for each account that genuinely came up with a notable STATE or SHIFT — where it stands, momentum, a decision, a warming/cooling relationship, a new stakeholder — a ONE-LINE note worth remembering the next time the user preps for that account. This is durable per-account memory, so be selective: only accounts with real substance today, NOT every account mentioned in passing. An empty array is the right answer on a thin day. Each row: { "account": "<closest account name>", "note": "<one line, the user's voice, no figures>", "impact": "positive|negative|mixed|unknown" }.

Today is ${today}.
The user's accounts: ${accountNames.length ? accountNames.join(", ") : "(none provided)"}.

Return ONLY JSON: { "read": "<2-4 sentence briefing>", "account_reads": [ { "account": "<name>", "note": "<one line>", "impact": "positive|negative|mixed|unknown" } ], "rows": [ { "kind": "owe|waiting|quiet|touch", "account": "<name>", "text": "<one line>", "who": "<person or null>", "due": "<YYYY-MM-DD or null>", "since": "<YYYY-MM-DD or null>", "done": false, "tone": "<positive|neutral|mixed|negative or null>", "theme": "<theme or null>" } ] }. No prose, no code fences.`;

    var msg = await client.messages.create({
      model: DIGEST_MODEL,
      max_tokens: 2000,
      // L3 — no cache_control: this is a once/day call whose system block embeds
      // today's date + the account roster, so the cache could never hit; the
      // ephemeral marker only added a write-premium for nothing.
      system: [{ type: "text", text: systemPrompt }],
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

    // The read is the PRIMARY output (the day briefing); rows are the few
    // items worth filing. Trim/guard it; null when the model didn't produce one.
    var read = (parsed && typeof parsed.read === "string" && parsed.read.trim())
      ? parsed.read.trim().slice(0, 1200)
      : null;

    // Per-account memory notes (Phase A) — durable "where this account stands"
    // lines that the client persists as folio_account_updates → they flow into
    // the cadence pre-call brief AND the daily brief (recentUpdates). Selective
    // by construction (the prompt asks only for accounts with real substance).
    var IMPACTS = { positive: 1, negative: 1, mixed: 1, unknown: 1 };
    var accountReads = (parsed && Array.isArray(parsed.account_reads) ? parsed.account_reads : [])
      .filter(function (a) { return a && a.account && a.note; })
      .slice(0, 12)
      .map(function (a) {
        return {
          account: a.account.toString().trim(),
          note: a.note.toString().trim().slice(0, 280),
          impact: IMPACTS[a.impact] ? a.impact : "unknown",
        };
      });

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

    return res.status(200).json({ read: read, account_reads: accountReads, rows: rows });
  } catch (err) {
    console.error("[parse-digest] error:", err && err.message);
    return res.status(500).json({ error: "Pip couldn't read that right now.", detail: err && err.message });
  }
}
