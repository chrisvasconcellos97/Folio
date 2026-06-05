// Weekly Haiku scan — Lane C terminology detection.
// Finds proper nouns / brand names appearing ≥3 times across recent meeting
// notes that aren't already known (account name, contact, glossary, pip_facts).
// Inserts folio_pip_questions rows (category='terminology', source='gap_observed').
//
// Called from App.jsx once per 7 days via a guarded fetch with Bearer token.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }
  try {
    var authHeader = req.headers.authorization || "";
    var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    var userId = user.id;

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

    // Build known-terms set (lowercased).
    var knownTerms = new Set();
    contacts.forEach(function (c) { if (c.name) knownTerms.add(c.name.toLowerCase()); });
    accounts.forEach(function (a) { if (a.name) knownTerms.add(a.name.toLowerCase()); });
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
      "You scan meeting notes for unknown proper nouns. ",
      "Return ONLY valid JSON — no markdown fences, no extra text. ",
      "Format: { \"terms\": [{ \"term\": \"string\", \"meeting_count\": number }] }",
    ].join("");

    var userPrompt = "Identify proper nouns, brand names, program names, or internal codenames that appear " +
      "3 or more times across these meeting notes AND are NOT in this known-terms list: [" + knownList + "]. " +
      "Only include terms with meeting_count >= 3. Return at most 8 terms. " +
      "Be conservative — only flag things that are clearly a specific named entity, not generic words.\n\n" +
      "Meeting notes:\n" + combinedNotes.slice(0, 8000);

    var msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    var raw = (msg.content && msg.content[0] && msg.content[0].text) || "{}";
    var parsed = {};
    try { parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "")); } catch (e) { /* empty */ }

    var terms = Array.isArray(parsed.terms) ? parsed.terms : [];

    // Filter to threshold ≥3 and not already asked.
    var newTerms = terms.filter(function (t) {
      return t.term && t.meeting_count >= 3 && !alreadyAsked.has(t.term.toLowerCase()) && !knownTerms.has(t.term.toLowerCase());
    });

    if (!newTerms.length) return res.status(200).json({ inserted: 0 });

    // Account-anchor each term: find the account whose meeting notes mention it
    // most, so Pip can ask "you keep saying X around <account>" — the question
    // Chris actually wants ("Why do you keep mentioning Fuse5 with John's Auto
    // Parts?") instead of a context-free "is that a new account?".
    var acctById = {};
    accounts.forEach(function (a) { if (a.id) acctById[a.id] = a.name; });

    function dominantAccountFor(term) {
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
      return top && acctById[top] ? acctById[top] : null;
    }

    var rows = newTerms.slice(0, 8).map(function (t) {
      var acctName = dominantAccountFor(t.term);
      var q = acctName
        ? "You keep mentioning " + t.term + " around " + acctName + " — what is it? A system they use, a brand, a program, or a person?"
        : "You keep mentioning " + t.term + " — what is it? A system, a brand, a program, or a person?";
      return {
        user_id:        userId,
        question_text:  q,
        category:       "terminology",
        source:         "gap_observed",
        status:         "queued",
        priority:       7,
        trigger_context: t.term,
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
