// Portfolio-aware question generator — Lane D.
// One cheap weekly Haiku pass that reasons over the whole portfolio and
// writes a few genuinely insightful questions in Pip's voice (the kind that
// piece things together across accounts), plus simple "what does X mean?"
// clarifiers. Drops them into folio_pip_questions (source='gap_observed').
//
// Cost guardrails:
//   1. Skips the Haiku call entirely if the user already has a backlog of
//      queued questions (>= QUEUE_SOFT_CAP) — never generate into a pile.
//   2. Runs weekly (App.jsx localStorage guard).
//   3. Sends a compact structured summary — account lines, theme counts, the
//      relationship power-map (champions/blockers), and short recent-summary
//      excerpts (NOT raw notes), all capped by a 9000-char slice. Wider input
//      lets questions connect threads across accounts; the slice keeps tokens
//      bounded.
// Net: ~one Sonnet call/week with a few thousand input tokens ≈ pennies/month.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var QUEUE_SOFT_CAP = 5;   // don't generate if this many are already queued
var MAX_NEW        = 5;   // most questions to write per run

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  }
  try {
    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var authRes = await supabase.auth.getUser(token);
    var user = authRes.data && authRes.data.user ? authRes.data.user : null;
    if (authRes.error || !user) return res.status(401).json({ error: "Unauthorized" });
    var userId = user.id;

    // ── Guard 1: skip if a backlog of queued questions already exists ──
    var queuedCount = await supabase
      .from("folio_pip_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["queued", "asked"]);
    if ((queuedCount.count || 0) >= QUEUE_SOFT_CAP) {
      return res.status(200).json({ skipped: true, reason: "queue_not_empty", queued: queuedCount.count });
    }

    // ── Gather compact portfolio state ──
    var results = await Promise.all([
      supabase.from("folio_accounts")
        .select("id, name, tier, account_type, status, status_override, last_interaction_at, objective, created_at")
        .eq("user_id", userId).eq("is_inactive", false).limit(60),
      supabase.from("folio_meetings")
        .select("theme, pip_tone")
        .eq("user_id", userId).not("theme", "is", null)
        .order("created_at", { ascending: false }).limit(80),
      supabase.from("gauge_projects")
        .select("title, status")
        .eq("user_id", userId).in("status", ["in_progress", "blocked", "planned"]).limit(20),
      supabase.from("folio_pip_facts")
        .select("fact").eq("user_id", userId).eq("active", true).limit(40),
      supabase.from("folio_user_profile")
        .select("role_title, company_name, industry, profile_prose").eq("user_id", userId).maybeSingle(),
      supabase.from("folio_pip_questions")
        .select("question_text").eq("user_id", userId).eq("source", "gap_observed")
        .in("status", ["queued", "asked", "answered", "skipped", "dismissed"]).limit(60),
      // Relationship power-map — who Pip should factor into "who really decides".
      supabase.from("folio_contacts")
        .select("name, relationship_role, account_id")
        .eq("user_id", userId).in("relationship_role", ["champion", "blocker"]).limit(40),
      // Recent activity excerpts (most recent summaries) so questions can connect
      // threads the way Pip does in chat — bounded + capped by the 9000-char slice.
      supabase.from("folio_meetings")
        .select("account_id, pip_summary, meeting_date")
        .eq("user_id", userId).not("pip_summary", "is", null)
        .order("created_at", { ascending: false }).limit(12),
    ]);

    var accounts = results[0].data || [];
    var meetings = results[1].data || [];
    var projects = results[2].data || [];
    var facts    = results[3].data || [];
    var profile  = results[4].data || null;
    var priorQ   = results[5].data || [];
    var relContacts = results[6].data || [];
    var recentMtgs  = results[7].data || [];

    var acctNameById = {};
    accounts.forEach(function (a) { acctNameById[a.id] = a.name; });

    if (accounts.length === 0) return res.status(200).json({ skipped: true, reason: "no_accounts" });

    // Account lines (compact).
    var acctLines = accounts.slice(0, 50).map(function (a) {
      var bits = [a.name];
      if (a.tier) bits.push(a.tier);
      if (a.account_type && a.account_type !== "standard") bits.push(a.account_type);
      var ds = daysSince(a.last_interaction_at);
      if (ds != null) bits.push(ds + "d since contact");
      if (a.status_override) bits.push("flagged " + a.status_override);
      if (!a.objective || !a.objective.trim()) bits.push("no objective on file");
      return "- " + bits.join(" · ");
    }).join("\n");

    // Theme counts across recent meetings.
    var themeCounts = {};
    meetings.forEach(function (m) {
      if (!m.theme) return;
      var k = String(m.theme).trim().toLowerCase();
      if (!k) return;
      themeCounts[k] = (themeCounts[k] || 0) + 1;
    });
    var themeLines = Object.keys(themeCounts)
      .sort(function (a, b) { return themeCounts[b] - themeCounts[a]; })
      .slice(0, 10)
      .map(function (k) { return "- " + k + " (" + themeCounts[k] + " meetings)"; })
      .join("\n");

    var projectLines = projects.slice(0, 15).map(function (p) {
      return "- " + (p.title || "untitled") + " [" + (p.status || "?") + "]";
    }).join("\n");

    var factLines = facts.map(function (f) { return "- " + f.fact; }).join("\n");
    var priorLines = priorQ.map(function (q) { return "- " + q.question_text; }).join("\n");

    // Relationship power-map (champions / blockers).
    var relLines = relContacts.map(function (c) {
      var an = acctNameById[c.account_id];
      return "- " + c.name + " — " + c.relationship_role + (an ? " @ " + an : "");
    }).join("\n");

    // Recent activity — short summary excerpts for the latest meetings.
    var recentLines = recentMtgs.slice(0, 8).map(function (m) {
      var an = acctNameById[m.account_id] || "an account";
      return "- " + an + (m.meeting_date ? " (" + m.meeting_date + ")" : "") + ": " +
        String(m.pip_summary || "").replace(/\s+/g, " ").slice(0, 180);
    }).join("\n");

    var profileBlock = profile
      ? [
          profile.role_title ? "Role: " + profile.role_title : "",
          profile.company_name ? "Company: " + profile.company_name : "",
          profile.industry ? "Industry: " + profile.industry : "",
          profile.profile_prose ? "Narrative: " + String(profile.profile_prose).slice(0, 600) : "",
        ].filter(Boolean).join("\n")
      : "(nothing recorded yet)";

    // ── Haiku pass ──
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var system = [
      "You are Pip, a loyal, sharp account-management analyst — the user's external brain.",
      "Your job here: study the portfolio summary and produce a few questions that would make YOU meaningfully smarter about this person's business and how to help them.",
      "TWO kinds of questions, mixed:",
      "  - \"portfolio\": a question that reasons across the data — a theme on multiple accounts, a gap between what they do and what you understand, something that doesn't add up, what 'good' looks like, how they're measured, who really decides. ALWAYS anchor it to something specific you see (name the account/theme/project). Lead with the observation, then the question.",
      "  - \"term\": a SIMPLE clarifier when you see a proper noun, acronym, brand, or system you don't understand (and it isn't already in known facts). e.g. \"You mention <X> a lot — what is it?\". Set the \"term\" field to that word.",
      "Voice: first person, plain, a little eager-to-help. Never generic personality-quiz filler ('what does a great week look like'). Every question must be impossible to ask without having read THIS portfolio.",
      "Do NOT ask anything already answered by Known facts / profile, and do NOT repeat anything in Already asked.",
      "Return ONLY JSON, no markdown fences: { \"questions\": [ { \"question\": \"...\", \"kind\": \"portfolio\"|\"term\", \"term\": \"only for kind=term\" } ] }. Return at most " + MAX_NEW + ". If you have nothing genuinely insightful, return fewer or an empty array — quality over quantity.",
    ].join("\n");

    var userMsg = [
      "ACCOUNTS (" + accounts.length + "):", acctLines || "(none)",
      "", "RECURRING MEETING THEMES:", themeLines || "(none recorded)",
      "", "ACTIVE GAUGE PROJECTS:", projectLines || "(none)",
      "", "RELATIONSHIP MAP (champions/blockers):", relLines || "(none recorded)",
      "", "RECENT ACTIVITY (latest summaries):", recentLines || "(none yet)",
      "", "WHAT YOU ALREADY KNOW (facts/profile — don't re-ask):", profileBlock, factLines || "(no facts yet)",
      "", "ALREADY ASKED (don't repeat):", priorLines || "(none)",
    ].join("\n");

    var msg = await client.messages.create({
      // Sonnet: reasoning over the whole portfolio to write genuinely
      // insightful questions is the surface users judge Pip's intelligence by.
      // Runs rarely (weekly + backlog guard), so the cost delta is negligible.
      model:      process.env.PIP_QUESTIONS_MODEL || "claude-sonnet-4-6",
      max_tokens: 1200, // 1200 (was 700): Sonnet's question JSON is fuller; 700 risked truncating the array

      system:     system,
      messages:   [{ role: "user", content: userMsg.slice(0, 9000) }],
    });

    var raw = (msg.content && msg.content[0] && msg.content[0].text) || "{}";
    var parsed = {};
    try { parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "")); } catch (e) { parsed = {}; }
    var questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    // Dedupe against everything already in the queue/history.
    var seen = new Set(priorQ.map(function (q) { return (q.question_text || "").trim().toLowerCase(); }));

    var rows = [];
    questions.forEach(function (q) {
      if (rows.length >= MAX_NEW) return;
      var text = q && typeof q.question === "string" ? q.question.trim() : "";
      if (!text) return;
      var key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      var isTerm = q.kind === "term";
      rows.push({
        user_id:         userId,
        question_text:   text,
        category:        isTerm ? "terminology" : "portfolio",
        source:          "gap_observed",
        status:          "queued",
        priority:        isTerm ? 7 : 8,
        trigger_context: isTerm && q.term ? String(q.term).trim() : null,
      });
    });

    if (!rows.length) return res.status(200).json({ inserted: 0 });

    var ins = await supabase.from("folio_pip_questions").insert(rows);
    if (ins.error) {
      console.error("[generate-questions] insert error:", ins.error.message);
      return res.status(500).json({ error: "Failed to insert questions.", detail: ins.error.message });
    }
    return res.status(200).json({ inserted: rows.length });
  } catch (err) {
    console.error("[generate-questions] error:", err && err.message);
    return res.status(500).json({ error: "Question generation unavailable.", detail: err && err.message });
  }
}
