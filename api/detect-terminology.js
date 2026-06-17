// Weekly Haiku scan — Lane C terminology detection.
// Finds proper nouns / brand names appearing ≥3 times across recent meeting
// notes that aren't already known (account name, contact, glossary, pip_facts).
// Inserts folio_pip_questions rows (category='terminology', source='gap_observed').
//
// Called from App.jsx once per 7 days via a guarded fetch with Bearer token.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

var rateLimitMap = new Map();
var WINDOW_MS    = 60 * 1000;
var MAX_REQUESTS = 5;
function isRateLimited(userId) {
  var now = Date.now();
  var timestamps = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (timestamps.length >= MAX_REQUESTS) return true;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }
  try {
    var authHeader = req.headers.authorization || "";
    var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    // Attach the caller's JWT so every query/insert runs as that user under RLS.
    // Without it the anon client reads zero rows (RLS: auth.uid() = user_id) and
    // the folio_pip_questions insert is rejected — silently breaking terminology
    // question generation. (Same fix as api/generate-questions.js.)
    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    var userId = user.id;

    if (isRateLimited(userId)) return res.status(429).json({ error: "rate_limited" });

    // Cost guard: if the user already has a backlog of queued questions, skip
    // the Haiku call entirely — never generate into a pile. Keeps tokens near
    // zero when questions aren't being answered.
    var queuedCount = await supabase
      .from("folio_pip_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["queued", "asked"]);
    if ((queuedCount.count || 0) >= 5) {
      return res.status(200).json({ skipped: true, reason: "queue_not_empty", queued: queuedCount.count });
    }

    // Fetch data in parallel.
    var [meetingsResult, contactsResult, accountsResult, glossaryResult, factsResult, existingQResult] = await Promise.all([
      // Last 40 meetings with notes.
      supabase
        .from("folio_meetings")
        .select("notes, title, account_id")
        .eq("user_id", userId)
        .not("notes", "is", null)
        .order("created_at", { ascending: false })
        .limit(40),
      // All contacts.
      supabase
        .from("folio_contacts")
        .select("name")
        .eq("user_id", userId),
      // All accounts.
      supabase
        .from("folio_accounts")
        .select("id, name")
        .eq("user_id", userId),
      // Glossary terms.
      supabase
        .from("pip_glossary")
        .select("term, aliases")
        .eq("user_id", userId),
      // Pip facts.
      supabase
        .from("folio_pip_facts")
        .select("fact")
        .eq("user_id", userId)
        .eq("active", true),
      // Existing terminology questions (so we don't re-ask).
      supabase
        .from("folio_pip_questions")
        .select("trigger_context")
        .eq("user_id", userId)
        .eq("category", "terminology")
        .in("status", ["queued", "asked", "answered"]),
    ]);

    var meetings  = meetingsResult.data  || [];
    var contacts  = contactsResult.data  || [];
    var accounts  = accountsResult.data  || [];
    var glossary  = glossaryResult.data  || [];
    var facts     = factsResult.data     || [];
    var existingQ = existingQResult.data || [];

    // Build known-terms set (lowercased). Index full names AND their individual
    // words — "Fenix" must be known because "Fenix Auto Parts" is an account
    // (the detector once asked what Fenix was... around Fenix Auto Parts).
    var knownTerms = new Set();
    function addWithWords(name) {
      if (!name) return;
      var lc = name.toLowerCase();
      knownTerms.add(lc);
      lc.split(/[\s/&·-]+/).forEach(function (w) {
        if (w.length > 2) knownTerms.add(w);
      });
    }
    contacts.forEach(function (c) { addWithWords(c.name); });
    accounts.forEach(function (a) { addWithWords(a.name); });
    glossary.forEach(function (g) {
      if (g.term) knownTerms.add(g.term.toLowerCase());
      if (Array.isArray(g.aliases)) g.aliases.forEach(function (a) { knownTerms.add(a.toLowerCase()); });
    });
    facts.forEach(function (f) {
      if (f.fact) {
        // Extract first "word group" before common separators.
        var firstWord = f.fact.split(/[\s—–-]/)[0];
        if (firstWord && firstWord.length > 2) knownTerms.add(firstWord.toLowerCase());
      }
    });

    // Build set of already-asked terminology trigger_contexts.
    var alreadyAsked = new Set(existingQ.map(function (q) { return (q.trigger_context || "").toLowerCase(); }));

    var combinedNotes = meetings
      .map(function (m) { return (m.notes || "") + " " + (m.title || ""); })
      .join("\n");

    if (!combinedNotes.trim()) return res.status(200).json({ inserted: 0 });

    // Haiku scan.
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var knownList = Array.from(knownTerms).slice(0, 100).join(", ");
    var systemPrompt = [
      "You scan meeting notes for unknown proper nouns and make a best GUESS at what each one is from context. ",
      "Never extract or guess at quantitative business data (revenue, volumes, customer counts, rosters, pricing) — terms only. ",
      "Return ONLY valid JSON — no markdown fences, no extra text. ",
      "Format: { \"terms\": [{ \"term\": \"string\", \"meeting_count\": number, \"guess\": \"one short phrase guessing what it is, e.g. 'a parts POS system they run' or 'an internal program name' — null if you truly can't tell\" }] }",
    ].join("");

    var userPrompt = "Identify proper nouns, brand names, program names, or internal codenames that appear " +
      "3 or more times across these meeting notes AND are NOT in this known-terms list: [" + knownList + "]. " +
      "Only include terms with meeting_count >= 3. Return at most 8 terms. " +
      "Be conservative — only flag things that are clearly a specific named entity, not generic words.\n\n" +
      "Meeting notes:\n" + combinedNotes.slice(0, 8000);

    var DETECT_MODEL = "claude-haiku-4-5-20251001";
    var msg = await client.messages.create({
      model:      DETECT_MODEL,
      max_tokens: 1024, // bumped from 600 — 600 risked truncating the JSON terms array
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });
    logPipUsage(supabase, userId, "detect-terminology", "terminology", DETECT_MODEL, msg.usage);

    // Truncation guard — a cut-off JSON payload is unusable; bail gracefully.
    if (msg.stop_reason === "max_tokens") {
      console.error("[detect-terminology] response truncated (stop_reason=max_tokens)");
      return res.status(200).json({ inserted: 0, truncated: true });
    }

    var raw = (msg.content && msg.content[0] && msg.content[0].text) || "{}";
    var parsed = {};
    try { parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "")); } catch (e) { /* empty */ }

    var terms = Array.isArray(parsed.terms) ? parsed.terms : [];

    // Filter to threshold ≥3 and not already asked.
    var accountNamesLc = accounts.map(function (a) { return (a.name || "").toLowerCase(); });
    var newTerms = terms.filter(function (t) {
      if (!t.term || t.meeting_count < 3) return false;
      var lc = t.term.toLowerCase();
      if (alreadyAsked.has(lc) || knownTerms.has(lc)) return false;
      // Substring of any account name (multi-word terms like "Fenix Auto") → known.
      if (accountNamesLc.some(function (n) { return n && n.indexOf(lc) !== -1; })) return false;
      return true;
    });

    if (!newTerms.length) return res.status(200).json({ inserted: 0 });

    // Account-anchor each term: find the account whose meeting notes mention it
    // most, so Pip can ask "you keep saying X around <account>" — the question
    // Chris actually wants ("Why do you keep mentioning Fuse5 with John's Auto
    // Parts?") instead of a context-free "is that a new account?".
    var acctById = {};
    accounts.forEach(function (a) { if (a.id) acctById[a.id] = a.name; });

    function dominantAccountIdFor(term) {
      var lc = term.toLowerCase();
      var counts = {};
      meetings.forEach(function (m) {
        if (!m.account_id) return;
        var hay = ((m.notes || "") + " " + (m.title || "")).toLowerCase();
        if (hay.indexOf(lc) === -1) return;
        // count occurrences in this meeting
        var n = hay.split(lc).length - 1;
        counts[m.account_id] = (counts[m.account_id] || 0) + n;
      });
      var top = null, topN = 0;
      Object.keys(counts).forEach(function (id) {
        if (counts[id] > topN) { topN = counts[id]; top = id; }
      });
      return top && acctById[top] ? top : null;
    }

    // Rank by confusion caused: terms that appear most get asked first.
    newTerms.sort(function (a, b) { return (b.meeting_count || 0) - (a.meeting_count || 0); });

    var rows = newTerms.slice(0, 8).map(function (t) {
      var acctId   = dominantAccountIdFor(t.term);
      var acctName = acctId ? acctById[acctId] : null;
      var guess    = t.guess && typeof t.guess === "string" ? t.guess.trim().slice(0, 120) : null;
      // Guess-and-confirm (questions reboot, Phase 1.7): lead with Pip's read
      // so the common case is a one-tap confirm, not an essay.
      var q;
      if (guess) {
        q = "\u201C" + t.term + "\u201D" + (acctName ? " (comes up a lot around " + acctName + ")" : "") +
          " — my read: " + guess + ". Am I right?";
      } else {
        q = acctName
          ? "You keep mentioning " + t.term + " around " + acctName + ". What is it: a system they use, a brand, a program, or a person?"
          : "You keep mentioning " + t.term + ". What is it: a system, a brand, a program, or a person?";
      }
      return {
        user_id:        userId,
        question_text:  q,
        category:       "terminology",
        source:         "gap_observed",
        status:         "queued",
        priority:       7 + Math.min(2, Math.floor((t.meeting_count || 3) / 3)),
        trigger_context: t.term,
        // Approved answers become a structured "systems they use" entry on the
        // account whose notes mention the term most. `guess` enables the
        // one-tap "✓ Right" confirm in the drip card / Catch Up.
        suggestion:     Object.assign(
          acctId ? { type: "account_system", account_id: acctId, account_name: acctName, term: t.term } : { term: t.term },
          guess ? { guess: guess } : {}
        ),
      };
    });

    var insertResult = await supabase.from("folio_pip_questions").insert(rows);
    if (insertResult.error) {
      console.error("[detect-terminology] insert error:", insertResult.error.message);
      return res.status(500).json({ error: "Failed to insert questions.", detail: insertResult.error.message });
    }

    return res.status(200).json({ inserted: rows.length });
  } catch (err) {
    console.error("[detect-terminology] error:", err && err.message);
    return res.status(500).json({ error: "Terminology scan unavailable.", detail: err && err.message });
  }
}
