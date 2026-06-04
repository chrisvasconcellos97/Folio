import { buildContactIndex, resolveAttendeeToContact } from "./contactEngagement.js";

// detectKnowledgeGaps — pure JS, zero LLM cost.
// Computes structural gaps in the user's Pip profile and inserts
// folio_pip_questions rows (source='gap_observed', status='queued').
// Dedupes by (user_id, question_text) against existing open rows.
// Called once per day from App.jsx as a fire-and-forget effect.

export var EVERGREEN_QUESTIONS = [
  { question_text: "What does a great week look like for you?", category: "working_style", priority: 3 },
  { question_text: "Who do you report to, and what do they care about most?", category: "goals", priority: 3 },
  { question_text: "What's the metric you're judged on — quota, retention, margin?", category: "goals", priority: 3 },
  { question_text: "Which account keeps you up at night right now?", category: "portfolio", priority: 3 },
  { question_text: "What's something about your role most people misunderstand?", category: "role", priority: 3 },
  { question_text: "When you prep for a big account meeting, what's the first thing you check?", category: "working_style", priority: 3 },
  { question_text: "What's one thing your best accounts have in common?", category: "portfolio", priority: 3 },
  { question_text: "What does a deal or renewal look like on your side — stages, stakeholders?", category: "portfolio", priority: 3 },
  { question_text: "Is there a part of your market you're trying to break into this year?", category: "goals", priority: 3 },
  { question_text: "What's the main reason accounts churn or go cold for you?", category: "portfolio", priority: 3 },
  { question_text: "If you could change one thing about how your accounts currently operate, what would it be?", category: "goals", priority: 3 },
  { question_text: "Are there certain types of accounts you enjoy working with more than others?", category: "portfolio", priority: 3 },
  { question_text: "What's the most useful thing a pre-call brief could tell you?", category: "working_style", priority: 3 },
  { question_text: "Do you prefer written summaries or bullet points when reviewing account status?", category: "working_style", priority: 3 },
  { question_text: "What's a win you're proud of from the last six months?", category: "goals", priority: 3 },
];

var PROFILE_SLOT_QUESTIONS = {
  role_title:      "Quick one — what's your actual title? Helps me frame things right.",
  company_name:    "What's the name of the company you work for?",
  industry:        "What industry would you say you're in?",
  portfolio_shape: "How would you describe the shape of your book — how many accounts, what mix?",
  primary_goal:    "What does a good quarter look like for you in one sentence?",
  working_style:   "How do you prefer Pip to communicate with you, and when is your week busiest?",
};

// Insert gap questions, deduping by question_text. Returns count inserted.
async function insertGapQuestions(userId, supabase, candidates) {
  if (!candidates.length) return 0;

  // Fetch existing drip questions (queued/asked/answered/skipped) to dedup.
  var existing = await supabase
    .from("folio_pip_questions")
    .select("question_text")
    .eq("user_id", userId)
    .eq("source", "gap_observed")
    .in("status", ["queued", "asked", "answered", "skipped", "dismissed"]);

  var existingTexts = new Set(
    (existing.data || []).map(function (r) { return r.question_text; })
  );

  var newOnes = candidates.filter(function (c) { return !existingTexts.has(c.question_text); });
  if (!newOnes.length) return 0;

  // Cap total new inserts at 5 per run.
  var toInsert = newOnes.slice(0, 5).map(function (c) {
    return Object.assign({}, c, {
      user_id: userId,
      source:  "gap_observed",
      status:  "queued",
    });
  });

  var r = await supabase.from("folio_pip_questions").insert(toInsert);
  if (r.error) throw r.error;
  return toInsert.length;
}

export async function detectKnowledgeGaps({ userId, supabase, accounts, meetings, contacts, profile }) {
  if (!userId || !supabase) return;

  var candidates = [];

  // ── 1. Contacts missing role who appear in ≥3 meetings ──────────────────
  if (contacts && contacts.length && meetings && meetings.length) {
    // Count meetings per canonical contact, resolving informal attendee strings
    // ("Mike" → "Michael Smith") via the shared resolver so the threshold
    // actually fires instead of being defeated by name-format drift.
    var index = buildContactIndex(contacts);
    var countsByName = {};
    meetings.forEach(function (m) {
      if (!Array.isArray(m.attendees)) return;
      var seen = {};
      m.attendees.forEach(function (att) {
        var canonical = resolveAttendeeToContact(att, index);
        if (!canonical || seen[canonical]) return;
        seen[canonical] = true;
        countsByName[canonical] = (countsByName[canonical] || 0) + 1;
      });
    });

    contacts.forEach(function (c) {
      var hasRole = (c.title && c.title.trim()) || (c.role && c.role.trim());
      if (hasRole) return;
      var name = c.name && c.name.trim();
      if (!name) return;
      var count = countsByName[c.name] || 0;
      if (count < 3) return;
      candidates.push({
        question_text:   "You’ve sat down with " + name + " a few times but I don’t have their role — who are they to the account?",
        category:        "gap",
        trigger_context: c.id,
        priority:        7,
      });
    });
  }

  // ── 2. Empty account objective after 30 days ────────────────────────────
  if (accounts && accounts.length) {
    var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    accounts
      .filter(function (a) { return !a.is_inactive; })
      .forEach(function (a) {
        var hasObjective = a.objective && a.objective.trim();
        if (hasObjective) return;
        var created = a.created_at ? new Date(a.created_at).getTime() : null;
        if (!created || created > thirtyDaysAgo) return;
        candidates.push({
          question_text:   "What’s the main objective with " + a.name + "? I don’t have one on file.",
          category:        "gap",
          trigger_context: a.id,
          priority:        6,
        });
      });
  }

  // ── 3. Null profile slots post-onboarding ──────────────────────────────
  if (profile && profile.onboarding_status === "done") {
    var slots = ["role_title", "company_name", "industry", "portfolio_shape", "primary_goal", "working_style"];
    slots.forEach(function (slot) {
      if (profile[slot] && String(profile[slot]).trim()) return;
      var qt = PROFILE_SLOT_QUESTIONS[slot];
      if (!qt) return;
      candidates.push({
        question_text:   qt,
        category:        "gap",
        slot:            slot,
        priority:        5,
      });
    });
  }

  if (!candidates.length) return;
  await insertGapQuestions(userId, supabase, candidates);
}

// Seeds the evergreen question bank ONLY if the user currently has zero
// queued drip questions (source='gap_observed', status='queued').
export async function seedEvergreenIfEmpty({ userId, supabase }) {
  if (!userId || !supabase) return;

  // Check for any existing queued drip questions.
  var check = await supabase
    .from("folio_pip_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "gap_observed")
    .eq("status", "queued")
    .limit(1);

  if (check.error) return;
  if (check.data && check.data.length > 0) return; // already have drip questions

  // Also check for existing evergreen texts (avoid re-seeding after all answered).
  var existing = await supabase
    .from("folio_pip_questions")
    .select("question_text")
    .eq("user_id", userId)
    .eq("source", "gap_observed");

  var existingTexts = new Set((existing.data || []).map(function (r) { return r.question_text; }));

  var toInsert = EVERGREEN_QUESTIONS
    .filter(function (q) { return !existingTexts.has(q.question_text); })
    .map(function (q) {
      return Object.assign({}, q, {
        user_id: userId,
        source:  "gap_observed",
        status:  "queued",
      });
    });

  if (!toInsert.length) return;

  var r = await supabase.from("folio_pip_questions").insert(toInsert);
  if (r.error) throw r.error;
}
