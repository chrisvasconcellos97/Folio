// Portfolio-aware question generator — Lane D.
// One cheap weekly Haiku pass that reasons over the whole portfolio and
// writes a few genuinely insightful questions in Pip's voice (the kind that
// piece things together across accounts), plus simple "what does X mean?"
// clarifiers. Drops them into folio_pip_questions (source='gap_observed').
//
// Cost guardrails:
//   1. Skips the Haiku call entirely if the user already has a backlog of
//      queued questions (>= QUEUE_SOFT_CAP) — never generate into a pile.
//      EXCEPTION: a manual "Teach Pip" session (body { manual:true }) bypasses
//      this cap and asks for a bigger batch — the user explicitly wants more.
//   2. Runs weekly (App.jsx localStorage guard); the manual path bypasses it.
//   3. Sends a compact structured summary — account lines, theme counts, the
//      relationship power-map (champions/blockers), and short recent-summary
//      excerpts (NOT raw notes), all capped by a 9000-char slice. Wider input
//      lets questions connect threads across accounts; the slice keeps tokens
//      bounded.
// Net: ~one Sonnet call/week with a few thousand input tokens ≈ pennies/month.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage, overDailySpendCap } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

// In-memory per-user rate limit: 5 requests per 60-second window.
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

    // Attach the caller's JWT to the client so EVERY query runs as that user
    // under RLS. Without this the anon client reads zero of the user's accounts
    // (RLS: auth.uid() = user_id) — so the endpoint bailed with "no_accounts" —
    // and the insert into folio_pip_questions was rejected by RLS. That made
    // "Pip, ask me more" silently produce nothing.
    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    var authRes = await supabase.auth.getUser(token);
    var user = authRes.data && authRes.data.user ? authRes.data.user : null;
    if (authRes.error || !user) return res.status(401).json({ error: "Unauthorized" });
    var userId = user.id;

    if (isRateLimited(userId)) return res.status(429).json({ error: "rate_limited" });

    // Manual "Teach Pip" sessions bypass the backlog cap + ask for a bigger
    // batch — the user explicitly wants more questions right now.
    // Read `manual` from BOTH the query string and the body. The query string
    // is always parsed by Vercel; req.body depends on content-type parsing, so
    // relying on it alone was fragile. teachPipMore() sends ?manual=1.
    var qManual = req.query && (req.query.manual === "1" || req.query.manual === "true" || req.query.manual === true);
    var manual = !!(qManual || (req.body && req.body.manual));
    var maxNew = manual ? 8 : MAX_NEW;

    // ── Guard 1: skip if a backlog of queued questions already exists ──
    var queuedCount = await supabase
      .from("folio_pip_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["queued", "asked"]);
    if (!manual && (queuedCount.count || 0) >= QUEUE_SOFT_CAP) {
      return res.status(200).json({ skipped: true, reason: "queue_not_empty", queued: queuedCount.count });
    }

    // ── Gather compact portfolio state ──
    var results = await Promise.all([
      supabase.from("folio_accounts")
        .select("id, name, tier, account_type, status, status_override, last_interaction_at, objective, created_at, owner_user_id")
        .eq("user_id", userId).eq("is_inactive", false).limit(60),
      supabase.from("folio_meetings")
        .select("theme, pip_tone")
        .eq("user_id", userId).not("theme", "is", null)
        .order("created_at", { ascending: false }).limit(80),
      supabase.from("gauge_projects")
        .select("title, status, status_updates")
        .eq("user_id", userId).in("status", ["in_progress", "blocked", "planned"]).limit(20),
      supabase.from("folio_pip_facts")
        .select("fact").eq("user_id", userId).eq("active", true).limit(40),
      supabase.from("folio_user_profile")
        .select("role_title, company_name, industry, profile_prose, operating_context").eq("user_id", userId).maybeSingle(),
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

    // Item 37 — split accounts by type so Pip understands org structure:
    // internal_team = the user's OWN departments (not external relationships);
    // everything else = external managed accounts.
    function fmtAcctLine(a) {
      var bits = [a.name];
      if (a.tier) bits.push(a.tier);
      var ds = daysSince(a.last_interaction_at);
      if (ds != null) bits.push(ds + "d since contact");
      if (a.status_override) bits.push("flagged " + a.status_override);
      if (!a.objective || !a.objective.trim()) bits.push("no objective on file");
      // Ownership: accounts owned by someone else are project-involvement only —
      // Pip must not generate relationship/outreach questions for them.
      if (a.owner_user_id && a.owner_user_id !== userId) bits.push("project-involved only — NOT your relationship");
      return "- " + bits.join(" · ");
    }
    var internalAccts = accounts.slice(0, 50).filter(function (a) { return a.account_type === "internal_team"; });
    var externalAccts = accounts.slice(0, 50).filter(function (a) { return a.account_type !== "internal_team"; });
    var acctBlock = "";
    if (internalAccts.length) {
      acctBlock += "YOUR OWN INTERNAL TEAMS / DEPARTMENTS (you ARE part of these — they are NOT external relationships to manage):\n" +
        internalAccts.map(fmtAcctLine).join("\n") + "\n\n";
    }
    acctBlock += "YOUR MANAGED ACCOUNTS (external suppliers, partners, clients — you maintain the relationship):\n" +
      (externalAccts.map(fmtAcctLine).join("\n") || "(none)");

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
      var bits = ["- " + (p.title || "untitled") + " [" + (p.status || "?") + "]"];
      var latest = Array.isArray(p.status_updates) && p.status_updates[0];
      if (latest) bits.push('latest: "' + String(latest.body || "").slice(0, 100) + '" (' + (latest.at ? String(latest.at).slice(0, 10) : "") + ')');
      return bits.join(" · ");
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
          profile.operating_context ? "Operating context: " + String(profile.operating_context).slice(0, 2600) : "",
          profile.profile_prose ? "Narrative: " + String(profile.profile_prose).slice(0, 600) : "",
        ].filter(Boolean).join("\n")
      : "(nothing recorded yet)";

    // ── Model selection — degrade to Haiku if over daily spend cap ──
    var MODEL_HAIKU  = "claude-haiku-4-5-20251001";
    var MODEL_SONNET = process.env.PIP_QUESTIONS_MODEL || "claude-sonnet-4-6";
    var overCap = await overDailySpendCap(supabase, userId);
    var questionsModel = overCap ? MODEL_HAIKU : MODEL_SONNET;

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    var system = [
      "You are Pip, a loyal, sharp account-management analyst — the user's external brain.",
      "Your job here: study the portfolio summary and produce a few questions that would make YOU meaningfully smarter about this person's business and how to help them.",
      "TWO kinds of questions, mixed:",
      "  - \"portfolio\": a question that reasons across the data — a theme on multiple accounts, a gap between what they do and what you understand, something that doesn't add up, what 'good' looks like, how they're measured, who really decides. ALWAYS anchor it to something specific you see (name the account/theme/project). Lead with the observation, then the question.",
      "  - \"term\": a SIMPLE clarifier when you see a proper noun, acronym, brand, or system you don't understand (and it isn't already in known facts). e.g. \"You mention <X> a lot — what is it?\". Set the \"term\" field to that word.",
      "ORG STRUCTURE: 'YOUR OWN INTERNAL TEAMS' are the user's own departments — never ask questions that treat them as external relationships to manage. Only ask about them in terms of how they coordinate with external managed accounts.",
      "OWNERSHIP: accounts marked 'project-involved only — NOT your relationship' belong to a colleague; never ask relationship, outreach, or cadence questions about them — only project-specific questions if something is genuinely unclear.",
      "Voice: first person, plain, a little eager-to-help. Never generic personality-quiz filler ('what does a great week look like'). Every question must be impossible to ask without having read THIS portfolio.",
      "Do NOT ask anything already answered by Known facts / profile, and do NOT repeat anything in Already asked.",
      "HARD DATA LINE (locked rule — never violate): NEVER ask for revenue figures, transaction volumes, customer counts, shop lists or rosters, pricing, or contract terms. This notebook deliberately excludes the employer's quantitative business data. When business performance matters, ask DIRECTIONALLY ('is volume trending up or down since the integration?') — never for a number, a count, or a list of customers.",
      "Return ONLY JSON, no markdown fences: { \"questions\": [ { \"question\": \"...\", \"kind\": \"portfolio\"|\"term\", \"term\": \"only for kind=term\" } ] }. Return at most " + maxNew + ". If you have nothing genuinely insightful, return fewer or an empty array — quality over quantity.",
    ].join("\n");

    // Manual "Teach Pip" session: the user is actively asking for more, so
    // override the default reluctance. Generate a FULL batch and dig deeper
    // than the surface gaps — second-order questions, per-account specifics,
    // follow-ups on what's already known — rather than returning empty.
    if (manual) {
      system += "\n\nIMPORTANT — THIS IS A MANUAL 'TEACH ME' SESSION. The user deliberately opened a session and asked you to keep going, so they WANT more questions right now. Do NOT return an empty or near-empty array. Produce a full batch of up to " + maxNew + " genuinely useful questions. Go BEYOND the obvious gaps you've already covered: dig into specific named accounts (their goals, who decides, what could derail them, what 'winning' looks like for that one account), follow up on themes/relationships/systems you partly know to sharpen them, and surface anything you'd want to understand to give a better brief next week. Still anchored to THIS portfolio and never generic filler — but lean hard toward generating, not abstaining.";
    }

    var userMsg = [
      "ACCOUNTS (" + accounts.length + " total — " + externalAccts.length + " managed, " + internalAccts.length + " internal teams):", acctBlock,
      "", "RECURRING MEETING THEMES:", themeLines || "(none recorded)",
      "", "ACTIVE GAUGE PROJECTS:", projectLines || "(none)",
      "", "RELATIONSHIP MAP (champions/blockers):", relLines || "(none recorded)",
      "", "RECENT ACTIVITY (latest summaries):", recentLines || "(none yet)",
      "", "WHAT YOU ALREADY KNOW (facts/profile — don't re-ask):", profileBlock, factLines || "(no facts yet)",
      "", "ALREADY ASKED (don't repeat):", priorLines || "(none)",
    ].join("\n");

    // Model call is wrapped so a model/SDK failure (bad model env, rate limit,
    // timeout) does NOT crash the whole request — for a manual session we still
    // want the deterministic fallback below to fire. modelError is surfaced in
    // the response for observability.
    var questions = [];
    var modelError = null;
    try {
      var msg = await client.messages.create({
        model:      questionsModel,
        max_tokens: 1200, // Sonnet's question JSON is fuller; lower risked truncating the array
        // cache_control on the static system prompt to reduce per-call cost.
        system:     [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages:   [{ role: "user", content: userMsg.slice(0, 9000) }],
        betas:      ["prompt-caching-2024-07-31"],
      });
      logPipUsage(supabase, userId, "generate-questions", "questions", questionsModel, msg.usage);
      var raw = (msg.content && msg.content[0] && msg.content[0].text) || "{}";
      var parsed = {};
      try { parsed = JSON.parse(raw.replace(/^```json\n?/, "").replace(/\n?```$/, "")); } catch (e) { parsed = {}; }
      questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch (modelErr) {
      modelError = (modelErr && modelErr.message) || "model_call_failed";
      console.error("[generate-questions] model call failed:", modelError);
      questions = [];
    }

    // Dedupe against everything already in the queue/history.
    var seen = new Set(priorQ.map(function (q) { return (q.question_text || "").trim().toLowerCase(); }));

    var rows = [];
    questions.forEach(function (q) {
      if (rows.length >= maxNew) return;
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

    // Manual fallback — if the user explicitly asked for more but the model
    // hedged (empty/all-duplicates), generate concrete account-anchored
    // questions so "ask me more" NEVER comes back empty. These are grounded in a
    // real account (not generic filler): prefer accounts with no objective on
    // file, then the rest, skipping internal teams and anything already asked.
    if (manual && rows.length === 0) {
      var fbAccounts = accounts
        .filter(function (a) { return a.account_type !== "internal_team"; })
        .filter(function (a) { return !(a.owner_user_id && a.owner_user_id !== userId); })
        .sort(function (a, b) {
          var an = (!a.objective || !a.objective.trim()) ? 0 : 1;
          var bn = (!b.objective || !b.objective.trim()) ? 0 : 1;
          return an - bn; // accounts with no objective first
        });
      fbAccounts.forEach(function (a) {
        if (rows.length >= maxNew) return;
        var qtext = "Where do things stand with " + a.name + " right now — what are you trying to move there, who really makes the call, and what could derail it?";
        var key = qtext.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          user_id:         userId,
          question_text:   qtext,
          category:        "portfolio",
          source:          "gap_observed",
          status:          "queued",
          priority:        8,
          trigger_context: null,
        });
      });
    }

    if (modelError && !rows.length) return res.status(502).json({ error: "question generation failed", detail: modelError });
    if (!rows.length) return res.status(200).json({ inserted: 0, modelReturned: questions.length });

    var ins = await supabase.from("folio_pip_questions").insert(rows);
    if (ins.error) {
      console.error("[generate-questions] insert error:", ins.error.message);
      return res.status(500).json({ error: "Failed to insert questions.", detail: ins.error.message });
    }
    return res.status(200).json({ inserted: rows.length, modelReturned: questions.length });
  } catch (err) {
    console.error("[generate-questions] error:", err && err.message);
    return res.status(500).json({ error: "Question generation unavailable.", detail: err && err.message });
  }
}
