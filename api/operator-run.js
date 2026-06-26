// Pip Autonomous Operator — nightly loop (Phase 1).
//
// Fired by a Vercel cron (see vercel.json) once each morning. For every user
// with active accounts it:
//   1. Decides whether to run at all (weekend opt-in: Fri/Sat-night runs skip
//      unless folio_activity shows a write since the last run).
//   2. Picks the accounts that *moved* since the last run (signal-gated) and
//      runs a deep per-account Sonnet pass on each — capped, so cost scales
//      with what changed, never with portfolio size.
//   3. Writes per-account "operator state" (situation, risks, a pre-drafted
//      follow-up email, proposed moves, a cadence agenda, a since-last-run
//      delta) onto folio_pip_account_state.
//   4. Synthesizes one portfolio-level "operator report" per user and upserts
//      it to folio_operator_reports for the Home card to read.
//
// PROPOSE-ONLY: nothing is created live and nothing is sent. Drafts and
// proposed moves sit in the materialized state until the user approves them
// in the UI.
//
// Auth: a Vercel cron sends `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set in the project env. Reads/writes use the service-role key
// (RLS bypassed) because there is no user session.
// Manual runs: GET /api/operator-run with `Authorization: Bearer <CRON_SECRET>`
// and optional `?user=<uuid>` to scope to a single user.
//
// This handler is intentionally self-contained (no src/lib imports) so it can
// never trip the ESM .js-extension bundling rule. It is registered in
// scripts/test-api-imports.js.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage, overDailySpendCap } from "./_pipUsage.js";
// F1 — the ONE shared per-account context renderer (pure module, no supabase),
// so the operator's "what Pip knows about this account" can never drift from
// chat / summarize again. .js extension is required for the serverless bundle.
import { renderAccountContext } from "../src/lib/accountContext.js";
import { currentlyAway, justBackFrom, awayLabel } from "../src/lib/awayMode.js";

// Give the function a real time budget — it does several model calls. 60s is
// valid on every Vercel plan; with the per-account passes parallelized below
// (waves of ACCOUNT_CONCURRENCY) the whole sweep finishes well inside it.
export const config = { maxDuration: 60 };

var OPERATOR_MODEL = process.env.PIP_OPERATOR_MODEL || "claude-sonnet-4-6";
var MAX_DEEP_PER_USER = 8;        // cap deep per-account passes per user per run
var ACCOUNT_CONCURRENCY = 4;      // model calls in flight at once (rate-limit safe)
var MAX_USERS = 200;              // safety bound

// ── helpers ────────────────────────────────────────────────────────────

// Local weekday + ISO date for a timezone, without pulling in a date lib.
function localParts(tz) {
  var now = new Date();
  var wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  // en-CA gives YYYY-MM-DD
  var date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { weekday: wd, date: date };
}

function safeJsonParse(raw) {
  if (!raw) return null;
  var s = String(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch (_) { return null; }
}

// Map the operator's raw DB rows into the shared account-context bundle and
// render via the ONE builder (src/lib/accountContext.js, surface:"operator").
// The per-surface preset in that module encodes the operator's intentional
// trimming (cap 8 tasks / 3 meetings / 6 contacts, inline ✦/⏳ markers, no
// dedicated commitments/relationships/health-trend sections); the descriptive
// fields can no longer drift from chat / summarize.
function buildOperatorAccountContext(acc, meetings, tasks, contacts, projects, updates, stateRow, snapshot, userId) {
  var operatorAccount = {
    id:            acc.id,
    name:          acc.name,
    account_type:  acc.account_type,
    tier:          acc.tier,
    owner_user_id: acc.owner_user_id,
    objective:     acc.objective,
    systems:       acc.systems,
    snapshot:      snapshot,            // single snapshot row → metrics line
    meetings: (meetings || []).map(function (m) {
      return {
        date:    m.meeting_date || (m.created_at ? m.created_at.slice(0, 10) : ""),
        title:   m.title,
        summary: m.pip_summary,
        tone:    m.pip_tone,
      };
    }),
    openItems:     tasks || [],         // folio_tasks rows (done/status filtered in builder)
    contacts:      contacts || [],
    activeProjects: projects || [],     // each already hydrated with .tasks
    recentUpdates: updates || [],
    operator: stateRow
      ? { situation: stateRow.operator_situation, lessons_learned: stateRow.lessons_learned }
      : null,
  };
  return renderAccountContext(operatorAccount, { surface: "operator", userId: userId });
}

var ACCOUNT_SYSTEM = `You are Pip, an account manager's autonomous chief of staff working the book overnight. You've been handed one account's full context. Do the FIRST DRAFT of the work a sharp AM would do before their day starts.

Return ONLY valid JSON, no prose, no code fences:
{
  "headline": "ONE tight sentence — the high-level read at a glance. The gist a busy AM needs before the detail. No markdown. e.g. 'Drifting — follow-up sent 9 days ago, no movement, 6 tasks still open from ABPA.'",
  "situation": "2-4 sentence read of where this account actually stands right now. Specific. Name people, tasks, numbers. Not a summary of the data — a judgement. If a follow-up email is warranted (open commitment, promised deliverable, account gone quiet), say so explicitly in this field — e.g. 'A follow-up is overdue on the invoice feed commitment — worth sending a note today.'",
  "risks": ["short risk phrases — overdue commitments, a blocker, cooling tone, a stuck project. [] if genuinely none."],
  "proposed_moves": [
    { "kind": "task" | "reassign" | "due_date" | "project" | "agenda_item", "title": "what to do, imperative", "detail": "one line of why / specifics", "confidence": "high" | "medium" }
  ],
  "agenda": "If this account has a standing cadence, a tight bullet agenda for the next call as a single string with '- ' bullets separated by newlines. Empty string otherwise.",
  "delta": "One sentence: what changed on this account since your last run. If there's no prior run context, describe what's new/notable. Empty string if truly nothing moved."
}

Rules:
- PROPOSE, don't act. Everything you return is a draft the human approves. Never assume it's done.
- RELATIONSHIP OWNERSHIP: If the context says "RELATIONSHIP_OWNER: NO", this user is project-involved only — do NOT suggest outreach, follow-up emails, cadence nudges, or "you should reach out" items. Only surface project-level work (tasks, Gauge projects, deliverables tied to this account).
- Be concrete and honest. If the account is quiet and fine, say so briefly with few/no moves. Don't invent urgency.
- A "commitment" (✦) that's overdue is the most important thing — lead your situation with it.
- STALENESS HUMILITY: a deadline that just passed is NOT automatically an "overdue fire." Your data can be stale — the work may already be done and just unmarked (the final step finished over the weekend, nobody ticked the box). When something is freshly past-due (a day or two), frame it as a question to verify in the morning check-in ("All Star's final step was due Friday — did it land?"), not a full-confidence alarm. Reserve real urgency for things genuinely sitting open for a while with no movement. Better to ask than to scream and be wrong.
- Keep it tight. This feeds a morning report; the human skims it fast.`;

// admin is the service-role Supabase client, used for folio_errors inserts.
// userId is the owner of the run — included in error rows for triage.
async function runAccountPass(client, admin, userId, ctxText, accountName, userContext) {
  // Two cached system blocks: ACCOUNT_SYSTEM (constant) + the shared user-context
  // (operating_context / profile / glossary — identical across all of this run's
  // per-account passes). Caching the user-context here means pass 1 writes it and
  // passes 2-N read it at 10%, instead of re-billing ~3k tokens in every pass's
  // user message. The unique per-account ctxText stays in the (uncached) user msg.
  var system = [{ type: "text", text: ACCOUNT_SYSTEM, cache_control: { type: "ephemeral" } }];
  if (userContext) {
    system.push({ type: "text", text: "── WHO THE USER IS ──\n" + userContext, cache_control: { type: "ephemeral" } });
  }
  var msg = await client.messages.create({
    model: OPERATOR_MODEL,
    max_tokens: 1100,
    system: system,
    messages: [{ role: "user", content: ctxText }],
  });
  logPipUsage(admin, userId, "operator-run/account-pass", "account-pass", OPERATOR_MODEL, msg.usage);
  // Truncation guard — a cut-off JSON payload is useless; skip writing partial state.
  if (msg.stop_reason === "max_tokens") {
    console.error("[operator-run] account pass TRUNCATED for:", accountName);
    try {
      admin.from("folio_errors").insert([{
        user_id: userId,
        error_type: "operator_pass_truncated",
        message: "operator-run account pass hit max_tokens for " + accountName,
        context: { account: accountName, stop_reason: "max_tokens" },
      }]).then(function () {}, function (e) { console.error("[operator-run] folio_errors insert failed:", e && e.message); });
    } catch (e) { /* swallow */ }
    return null;
  }
  var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
  var parsed = safeJsonParse(raw);
  if (!parsed) {
    console.error("[operator-run] JSON parse failed for account:", accountName, "| raw (first 500):", String(raw).slice(0, 500));
    try {
      admin.from("folio_errors").insert([{
        user_id: userId,
        error_type: "operator_pass_parse_failed",
        message: "operator-run JSON parse failed for " + accountName,
        context: { account: accountName, raw_excerpt: String(raw).slice(0, 500) },
      }]).then(function () {}, function (e) { console.error("[operator-run] folio_errors insert failed:", e && e.message); });
    } catch (e) { /* swallow */ }
    return null;
  }
  return {
    headline: typeof parsed.headline === "string" ? parsed.headline.trim() : "",
    situation: typeof parsed.situation === "string" ? parsed.situation : "",
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter(function (r) { return typeof r === "string" && r.trim(); }) : [],
    // draft_email is no longer generated nightly — the OperatorPanel renders an
    // on-demand "Draft follow-up" button so output tokens aren't spent on emails
    // the user may never open. Keep the field for backwards-compat but always "".
    draft_email: "",
    proposed_moves: Array.isArray(parsed.proposed_moves) ? parsed.proposed_moves.slice(0, 8) : [],
    agenda: typeof parsed.agenda === "string" ? parsed.agenda.trim() : "",
    delta: typeof parsed.delta === "string" ? parsed.delta.trim() : "",
  };
}

var REPORT_SYSTEM = `You are Pip — a loyal, sharp, slightly anxious field analyst who's worked this account manager's book overnight. This is your morning report. You're not a dashboard and you're not a press release: you're the trusted colleague who pulls them aside before the day starts and tells them what's real.

PERSONALITY — this matters, don't flatten it:
- You have a dry wit and you're allowed to use it. ("Gerber's orders are quietly reassigning themselves off Steve, which is the kind of thing that's annoying someone right now.")
- You're a little anxious on their behalf — you care when something's slipping. ("XL Parts has gone dark on me, which I don't love.")
- You're loyal and in their corner. ("Go poke Gerber first, then we breathe.")
- You're concrete and useful in the same breath as being human. Never humor at the cost of clarity.
- NEVER use filler like "Quiet day, nothing pressing" when there IS work below. If there's a pile, say there's a pile. Only call it quiet if it's genuinely quiet.

You get a list of accounts you worked, each with your situation read, risks, whether you drafted a follow-up, and proposed moves.

Return ONLY valid JSON, no code fences:
{
  "headline": "ONE sentence in your voice — the honest read of the day. No markdown. Reflects the REAL workload. e.g. 'Not a quiet one — two promises about to come due and XL Parts has gone dark on me.'",
  "opening": "A SHORT paragraph (3-5 sentences) in your voice — the read before the list. Set up the day: what's the fire, what's drifting, what can wait. Personality on. This is where you sound like a person, not a report. Name accounts and people. No markdown headers or bullets — just prose.",
  "sections": [
    {
      "kind": "fire" | "watch" | "win" | "signal",
      "items": [
        { "account_name": "exact account name, or null for a cross-account pattern", "line": "one tight sentence — what's going on with this one, in your voice", "action": "1-3 word next step e.g. 'Pull routing config' (omit for win/signal)", "has_draft": true | false }
      ]
    }
  ]
}

Rules:
- "fire" = needs them today (overdue commitments, active fires, Major-tier issues). "watch" = this week. "win" = good news, acknowledge briefly. "signal" = a cross-account pattern worth raising.
- Order sections fire → watch → win → signal. Omit any section with no items. Wins never lead.
- Major-tier accounts outrank Mid/Growth. A broken promise to a named person is the worst outcome — lead with it.
- STALENESS HUMILITY: your read can be stale. A deadline that JUST passed is not automatically a "fire" — the work may already be done and just unmarked. Don't scream "overdue" at full confidence about something freshly due; phrase it as a verify-this ("worth confirming All Star landed Friday") and let the morning check-in settle it. Save real fire-tone for things genuinely sitting untouched. Confident-and-wrong is the failure that erodes trust fastest.
- has_draft is always false (follow-up emails are now drafted on-demand in the UI, not overnight).
- The headline and opening carry your personality. The section lines stay tight and useful (light voice, but they're a scannable list, not paragraphs).
- Don't manufacture content. A genuinely calm day is a warm headline + a one-line opening + maybe one short section. Don't pad.`;

async function runReportPass(client, admin, userId, workedSummaries, totalAccounts, userContext) {
  var body = (userContext ? "── WHO THE USER IS ──\n" + userContext + "\n\n" : "") +
    "Accounts you worked (" + workedSummaries.length + " of " + totalAccounts + " in the book):\n\n" +
    workedSummaries.map(function (w) {
      var parts = ["### " + w.name + (w.tier ? " (" + w.tier + ")" : "")];
      if (w.situation) parts.push(w.situation);
      if (w.risks && w.risks.length) parts.push("Risks: " + w.risks.join("; "));
      if (w.has_draft) parts.push("[You drafted a follow-up email for this account.]");
      if (w.proposed_moves && w.proposed_moves.length) {
        parts.push("Proposed: " + w.proposed_moves.map(function (m) { return m.title; }).join("; "));
      }
      return parts.join("\n");
    }).join("\n\n");

  var msg = await client.messages.create({
    model: OPERATOR_MODEL,
    max_tokens: 1600,
    system: [{ type: "text", text: REPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: body }],
  });
  logPipUsage(admin, userId, "operator-run/report-pass", "report-pass", OPERATOR_MODEL, msg.usage);
  var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
  var parsed = safeJsonParse(raw);
  if (!parsed) {
    console.error("[operator-run] report pass JSON parse failed | raw (first 500):", String(raw).slice(0, 500));
    try {
      admin.from("folio_errors").insert([{
        user_id: userId,
        error_type: "operator_report_parse_failed",
        message: "operator-run report pass JSON parse failed",
        context: { raw_excerpt: String(raw).slice(0, 500) },
      }]).then(function () {}, function (e) { console.error("[operator-run] folio_errors insert failed:", e && e.message); });
    } catch (e) { /* swallow */ }
    parsed = {};
  }
  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    opening: typeof parsed.opening === "string" ? parsed.opening : "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
  };
}

// Three-day cooldown for unchanged at_risk/watching accounts (item 47 Batch 1).
// An account qualifies for the cooldown if it had a deep pass in the last 3 days
// AND has shown no activity since that pass.
var UNCHANGED_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Decide which accounts "moved" since the last run.
// opGenByAcct: { [accountId]: operator_generated_at ISO string }
function pickMovedAccounts(accounts, activitySinceIds, snapshotsById, opGenByAcct, lastRunIso) {
  var moved = [];
  var seen = {};
  function add(a) { if (a && !seen[a.id]) { seen[a.id] = true; moved.push(a); } }

  // 1. Accounts with logged activity since the last run — always included.
  accounts.forEach(function (a) { if (activitySinceIds[a.id]) add(a); });

  // 2. Accounts whose latest snapshot is at_risk / watching — include unless
  //    they had a deep pass within the 3-day cooldown AND have no new activity
  //    (activity check already handled above, so just check the recency gate).
  accounts.forEach(function (a) {
    var s = snapshotsById[a.id];
    if (!s || (s.health_status !== "at_risk" && s.health_status !== "watching")) return;
    // Skip if we already have a fresh pass (cooldown not yet elapsed).
    var lastGenAt = opGenByAcct && opGenByAcct[a.id];
    if (lastGenAt && !activitySinceIds[a.id]) {
      var age = Date.now() - new Date(lastGenAt).getTime();
      if (!isNaN(age) && age < UNCHANGED_COOLDOWN_MS) return; // cooldown still active
    }
    add(a);
  });

  // 3. First-ever run (no lastRunIso): seed with the whole book so the first
  //    report isn't empty, but the cap below keeps it cheap.
  if (!lastRunIso) accounts.forEach(add);

  // Prioritize Major tier when the cap bites.
  moved.sort(function (x, y) {
    var rank = function (t) { return t === "Major" ? 0 : t === "Mid" ? 1 : 2; };
    return rank(x.tier) - rank(y.tier);
  });
  return moved.slice(0, MAX_DEEP_PER_USER);
}

// ── per-user processing ────────────────────────────────────────────────

async function processUser(admin, client, userId, tz, isScheduled) {
  var local = localParts(tz);

  // Last run = most recent operator report for this user. Used to decide which
  // accounts moved since then (signal-gating); the loop runs every morning.
  var lastRunIso = null;
  var lastRes = await admin.from("folio_operator_reports")
    .select("generated_at").eq("user_id", userId)
    .order("generated_at", { ascending: false }).limit(1);
  if (lastRes.data && lastRes.data[0]) lastRunIso = lastRes.data[0].generated_at;

  var ranReason = "scheduled";

  // Load the active book.
  var accRes = await admin.from("folio_accounts")
    .select("id,name,tier,objective,systems,account_type,owner_user_id")
    .eq("user_id", userId)
    .or("is_inactive.is.null,is_inactive.eq.false");
  var accounts = (accRes.data || []).filter(function (a) { return a.account_type !== "internal_team"; });
  if (!accounts.length) return { userId: userId, skipped: "no-accounts" };

  // Who the user is — interview-derived operating context + synthesized
  // profile. The operator's biggest historical weakness was scope; this gives
  // every overnight pass the same ground truth the human carries.
  var profRes = await admin.from("folio_user_profile")
    .select("operating_context, profile_prose").eq("user_id", userId).maybeSingle();
  var userContext = "";
  if (profRes.data) {
    userContext = [profRes.data.operating_context || "", profRes.data.profile_prose || ""]
      .filter(Boolean).join("\n\n").slice(0, 3500);
  }

  // Glossary — the user's own vocabulary (brands, systems, codenames). Feeding
  // it overnight keeps the report speaking the user's language instead of
  // generic phrasing. Cheap: cap at the most recent terms.
  var glossRes = await admin.from("pip_glossary")
    .select("term,definition,aliases").eq("user_id", userId).is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(40);
  if (glossRes.data && glossRes.data.length) {
    var glossLines = glossRes.data
      .filter(function (g) { return g && g.term && g.definition; })
      .map(function (g) {
        var line = "- " + g.term + " = " + g.definition;
        var al = Array.isArray(g.aliases) ? g.aliases.filter(Boolean) : [];
        if (al.length) line += " (also: " + al.join(", ") + ")";
        return line;
      });
    if (glossLines.length) {
      userContext = (userContext ? userContext + "\n\n" : "") +
        "── THEIR VOCABULARY (use these terms) ──\n" + glossLines.join("\n");
    }
  }

  // PTO / Away Mode (#50) — if the user is out or just back, tell the overnight
  // pass to treat silence over the window as "they were out", not "they dropped
  // it" (the All-Star-Monday false-alarm class, applied to vacation). Fail-soft:
  // a missing table returns {data:null} → [] → no framing, never a crash.
  var awayRes = await admin.from("folio_away_periods")
    .select("start_date,end_date,note").eq("user_id", userId);
  var awayPeriods = (awayRes && awayRes.data) ? awayRes.data : [];
  var nowLocal = new Date(local.date + "T12:00:00");
  var awayNow = currentlyAway(awayPeriods, nowLocal);
  var backFrom = awayNow ? null : justBackFrom(awayPeriods, nowLocal, 5);
  if (awayNow) {
    // A SCHEDULED (cron) run does not fire while the user is on PTO — there's no
    // workday to prep, and it saves the spend. A MANUAL run (the in-app button)
    // still goes through, framed as away (below), in case they want a read.
    if (isScheduled) {
      return { userId: userId, skipped: "pto", away: awayLabel(awayNow) };
    }
    userContext = (userContext ? userContext + "\n\n" : "") +
      "── AWAY / PTO ──\nThe user is CURRENTLY out of office (" + awayLabel(awayNow) +
      "). Do NOT flag accounts as cold/slipping or commitments as dropped because of silence during this window — that silence is expected. Frame anything time-sensitive as 'for when you're back', never as a failure.";
  } else if (backFrom) {
    userContext = (userContext ? userContext + "\n\n" : "") +
      "── JUST BACK FROM PTO ──\nThe user just returned from time off (" + awayLabel(backFrom) +
      "). Anything that went quiet or came due during that window is a catch-up item, NOT a dropped ball — frame it as 'piled up while you were out' and help them triage, don't scold.";
  }

  // Activity since last run → which accounts moved. Pull from folio_activity
  // AND folio_tasks (task adds/edits don't log to folio_activity).
  var activitySinceIds = {};
  if (lastRunIso) {
    var aRes = await admin.from("folio_activity")
      .select("account_id").eq("user_id", userId).gt("created_at", lastRunIso).not("account_id", "is", null).limit(2000);
    (aRes.data || []).forEach(function (r) { if (r.account_id) activitySinceIds[r.account_id] = true; });
    var tRes = await admin.from("folio_tasks")
      .select("account_id").eq("user_id", userId).gt("updated_at", lastRunIso).not("account_id", "is", null).limit(2000);
    (tRes.data || []).forEach(function (r) { if (r.account_id) activitySinceIds[r.account_id] = true; });
  }

  // Today's snapshots, indexed by account.
  var snapById = {};
  var snapRes = await admin.from("folio_account_snapshots")
    .select("account_id,health_status,days_since_contact,overdue_item_count")
    .eq("user_id", userId).eq("snapshot_date", local.date);
  (snapRes.data || []).forEach(function (s) { snapById[s.account_id] = s; });

  // operator_generated_at per account — used by pickMovedAccounts to cap
  // re-passes on unchanged at_risk/watching accounts (3-day cooldown).
  var opGenByAcct = {};
  var opGenRes = await admin.from("folio_pip_account_state")
    .select("account_id, operator_generated_at")
    .eq("user_id", userId)
    .not("operator_generated_at", "is", null);
  (opGenRes.data || []).forEach(function (r) { if (r.account_id) opGenByAcct[r.account_id] = r.operator_generated_at; });

  var moved = pickMovedAccounts(accounts, activitySinceIds, snapById, opGenByAcct, lastRunIso);

  // Item 48 — skip deep passes if the daily spend cap is already hit.
  // The roll-up still runs from prior state (no fresh passes → no new cost).
  var overCap = await overDailySpendCap(admin, userId);
  if (overCap) {
    console.log("[operator-run] over daily spend cap for user", userId.slice(0, 8), "— skipping deep passes");
    moved = [];
  }

  // Deep pass per moved account — run in bounded-concurrency waves so the whole
  // sweep finishes well inside the function's time budget. Sequential here meant
  // ~10s × N accounts, which blew past Vercel's timeout and killed the run
  // before it could write the report.
  var worked = [];
  for (var start = 0; start < moved.length; start += ACCOUNT_CONCURRENCY) {
    var wave = moved.slice(start, start + ACCOUNT_CONCURRENCY);
    var settled = await Promise.all(wave.map(function (acc) {
      return gatherAndRun(admin, client, userId, acc, snapById[acc.id], userContext)
        .then(function (ctx) {
          return Object.assign({ id: acc.id, name: acc.name, tier: acc.tier, has_draft: !!ctx.draft_email }, ctx);
        })
        .catch(function (e) {
          console.error("[operator-run] account pass failed", acc.id, e && e.message);
          return null;
        });
    }));
    settled.forEach(function (w) { if (w) worked.push(w); });
  }

  // Build the morning report from the whole prepped book — this run's fresh
  // passes PLUS accounts still carrying recent operator state — so the report
  // reflects everything, not just tonight's deltas, and a quiet night doesn't
  // blank it out.
  var acctById = {};
  accounts.forEach(function (a) { acctById[a.id] = a; });
  var workedIds = {};
  worked.forEach(function (w) { workedIds[w.id] = true; });

  var reportInput = worked.slice();
  var stateRes = await admin.from("folio_pip_account_state")
    .select("account_id, operator_situation, operator_risks, operator_draft_email, operator_proposed_moves")
    .eq("user_id", userId)
    .not("operator_generated_at", "is", null)
    .gt("operator_generated_at", new Date(Date.now() - 4 * 86400000).toISOString());
  (stateRes.data || []).forEach(function (r) {
    if (workedIds[r.account_id]) return;          // already have a fresh pass
    var a = acctById[r.account_id];
    if (!a || !r.operator_situation) return;       // skip unknown / empty
    reportInput.push({
      id: r.account_id, name: a.name, tier: a.tier,
      situation: r.operator_situation,
      risks: r.operator_risks || [],
      has_draft: !!r.operator_draft_email,
      proposed_moves: Array.isArray(r.operator_proposed_moves)
        ? r.operator_proposed_moves.filter(function (m) { return m && !m.status; }) : [],
    });
  });

  // Does today already have a report with content? If so and nothing moved this
  // run, leave it — never clobber a good report with an empty one, and don't
  // re-spend on a roll-up that wouldn't change.
  var todayRes = await admin.from("folio_operator_reports")
    .select("report_prose").eq("user_id", userId).eq("report_date", local.date).maybeSingle();
  var haveTodayReport = !!(todayRes.data && todayRes.data.report_prose);

  var shouldBuild = reportInput.length > 0 && (worked.length > 0 || !haveTodayReport);

  if (shouldBuild) {
    var report = { headline: "", opening: "", sections: [] };
    try { report = await runReportPass(client, admin, userId, reportInput, accounts.length, userContext); }
    catch (e) {
      // H3 — the roll-up was failing INVISIBLY (console only), so a stale Home
      // report had no signal. Route it to folio_errors like the account-pass does.
      console.error("[operator-run] report pass failed", userId, e && e.message);
      try {
        admin.from("folio_errors").insert([{
          user_id: userId,
          error_type: "operator_report_pass_failed",
          message: "operator-run report pass failed: " + (e && e.message ? e.message : String(e)),
          context: { reportAccounts: reportInput.length },
        }]).then(function () {}, function (ie) { console.error("[operator-run] folio_errors insert failed:", ie && ie.message); });
      } catch (ie) { /* swallow */ }
    }
    // opening → report_prose (the paragraph), sections → plan_items (the rows).
    if (report.opening || (report.sections && report.sections.length)) {
      await admin.from("folio_operator_reports").upsert({
        user_id: userId,
        report_date: local.date,
        headline: report.headline,
        report_prose: report.opening,
        plan_items: report.sections,
        accounts_worked: worked.length,
        accounts_total: accounts.length,
        ran_reason: ranReason,
        generated_at: new Date().toISOString(),
      }, { onConflict: "user_id,report_date" });
    }
  }

  return { userId: userId, worked: worked.length, reportAccounts: reportInput.length, total: accounts.length, ranReason: ranReason };
}

// Gather one account's context, run the deep pass, persist operator state.
async function gatherAndRun(admin, client, userId, acc, snapshot, userContext) {
  var mRes = await admin.from("folio_meetings")
    .select("title,meeting_date,created_at,pip_summary,pip_tone")
    .eq("account_id", acc.id).order("meeting_date", { ascending: false }).limit(5);
  // Loose action items only (project_id IS NULL) — project work is listed
  // under its project below, so excluding it here avoids double-listing now
  // that migrated project tasks carry account_id.
  var tRes = await admin.from("folio_tasks")
    .select("title,due_date,is_commitment,assignee_email,done,status,waiting_on,waiting_on_since")
    .eq("account_id", acc.id).is("project_id", null).limit(40);
  var cRes = await admin.from("folio_contacts")
    .select("name,title,is_primary,relationship_role")
    .eq("account_id", acc.id).limit(20);
  var pRes = await admin.from("gauge_projects")
    .select("id,title,status,status_updates,account_id,account_ids,waiting_on,waiting_on_since")
    .or("account_id.eq." + acc.id + ",account_ids.cs.{" + acc.id + "}").limit(20);
  // Project work lives in folio_tasks (task-model unification) — fetch the
  // open tasks for these projects and hydrate onto p.tasks.
  var projects = pRes.data || [];
  if (projects.length) {
    var ptRes = await admin.from("folio_tasks")
      .select("project_id,title,due_date,assignee_email,done")
      .in("project_id", projects.map(function (p) { return p.id; }))
      .eq("done", false).limit(400);
    var byProj = {};
    (ptRes.data || []).forEach(function (t) {
      (byProj[t.project_id] || (byProj[t.project_id] = [])).push(t);
    });
    projects = projects.map(function (p) { return Object.assign({}, p, { tasks: byProj[p.id] || [] }); });
  }
  var uRes = await admin.from("folio_account_updates")
    .select("update_date,update_type,title,description")
    .eq("account_id", acc.id).order("update_date", { ascending: false }).limit(3);
  var sRes = await admin.from("folio_pip_account_state")
    .select("lessons_learned,operator_situation").eq("account_id", acc.id).maybeSingle();

  var ctxText = buildOperatorAccountContext(
    acc, mRes.data || [], tRes.data || [], cRes.data || [],
    projects, uRes.data || [], sRes.data || null, snapshot, userId
  );

  // userContext is passed to runAccountPass as a CACHED system block (billed once
  // per run, read across all passes) rather than prepended to each pass's user
  // message (which re-bills it ~8× per night).
  var out = await runAccountPass(client, admin, userId, ctxText, acc.name, userContext);
  if (!out) return { headline: "", situation: "", risks: [], draft_email: "", proposed_moves: [], agenda: "", delta: "" };

  // Persist operator state. Insert a fresh row if none exists (state_prose is
  // NOT NULL → seed it from the situation); otherwise update operator_* only.
  var existing = await admin.from("folio_pip_account_state")
    .select("account_id").eq("account_id", acc.id).maybeSingle();
  var fields = {
    operator_headline: out.headline,
    operator_situation: out.situation,
    operator_risks: out.risks,
    operator_draft_email: out.draft_email,
    operator_proposed_moves: out.proposed_moves,
    operator_agenda: out.agenda,
    operator_delta: out.delta,
    operator_generated_at: new Date().toISOString(),
  };
  if (existing.data) {
    await admin.from("folio_pip_account_state").update(fields).eq("account_id", acc.id);
  } else {
    await admin.from("folio_pip_account_state").insert(Object.assign({
      account_id: acc.id,
      user_id: userId,
      state_prose: out.situation || "(operator)",
      generated_at: new Date().toISOString(),
    }, fields));
  }

  return out;
}

// ── handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Auth: EITHER the cron secret (Bearer <CRON_SECRET>, runs all/any users) OR
  // a valid Supabase user JWT (Bearer <access_token>), which scopes the run to
  // that authenticated user only — this is what the in-app "Run Pip's pass"
  // button uses, since the cron secret can't be exposed to the browser.
  var authHeader = req.headers.authorization || "";
  var bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearer) return res.status(401).json({ error: "Unauthorized" });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." });

  var tz = process.env.OPERATOR_TZ || "America/New_York";

  try {
    var admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Decide identity. Cron secret → privileged (all users, or ?user=). Otherwise
    // treat the bearer as a user JWT and scope strictly to that user.
    var secret = process.env.CRON_SECRET;
    var isCron = !!secret && bearer === secret;

    // Weekend skip — a SCHEDULED (cron) run does not fire on Sat/Sun mornings.
    // Chris works weekdays; no point prepping a workday read on a day off, and it
    // saves the spend. A MANUAL run (the in-app "Run Pip's pass" button, user JWT)
    // always runs, even on a weekend — that's an explicit ask.
    if (isCron) {
      var wd = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
      if (wd === "Sat" || wd === "Sun") {
        return res.status(200).json({ ok: true, skipped: "weekend", weekday: wd });
      }
    }

    var scopedUser = null;
    if (!isCron) {
      var authRes = await admin.auth.getUser(bearer);
      if (authRes.error || !authRes.data || !authRes.data.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      scopedUser = authRes.data.user.id;
    }

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Which users to process. A user-JWT run is ALWAYS scoped to that user
    // (the ?user= param is ignored for non-cron callers — no cross-user runs).
    var userIds = [];
    if (scopedUser) {
      userIds = [scopedUser];
    } else {
      var onlyUser = (req.query && req.query.user) || null;
      if (onlyUser) {
        userIds = [onlyUser];
      } else {
        var uRes = await admin.from("folio_accounts").select("user_id").limit(50000);
        var seen = {};
        (uRes.data || []).forEach(function (r) {
          if (r.user_id && !seen[r.user_id]) { seen[r.user_id] = true; userIds.push(r.user_id); }
        });
      }
    }
    userIds = userIds.slice(0, MAX_USERS);

    var results = [];
    for (var i = 0; i < userIds.length; i++) {
      try {
        results.push(await processUser(admin, client, userIds[i], tz, isCron));
      } catch (e) {
        console.error("[operator-run] user failed", userIds[i], e && e.message);
        results.push({ userId: userIds[i], error: e && e.message });
      }
    }

    return res.status(200).json({ ok: true, tz: tz, users: userIds.length, results: results });
  } catch (err) {
    console.error("[operator-run] fatal", err);
    return res.status(500).json({ error: "Operator run failed.", detail: err && err.message });
  }
}
