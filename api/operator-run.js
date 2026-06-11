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
import { logPipUsage } from "./_pipUsage.js";

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

function excerpt(s, n) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Build the compact per-account context block the deep pass reasons over.
function renderAccountContext(acc, meetings, tasks, contacts, projects, updates, stateRow, snapshot) {
  var lines = [];
  lines.push("ACCOUNT: " + acc.name + (acc.tier ? " (" + acc.tier + " tier)" : ""));
  if (acc.objective) lines.push("Their goal: " + excerpt(acc.objective, 200));
  if (Array.isArray(acc.systems) && acc.systems.length) {
    lines.push("Systems they use: " + acc.systems.map(function (s) { return typeof s === "string" ? s : (s && s.name) || ""; }).filter(Boolean).join(", "));
  }
  if (snapshot) {
    lines.push("Health: " + (snapshot.health_status || "?") +
      (snapshot.days_since_contact != null ? " · " + snapshot.days_since_contact + "d since contact" : "") +
      (snapshot.overdue_item_count ? " · " + snapshot.overdue_item_count + " overdue" : ""));
  }

  if ((contacts || []).length) {
    lines.push("\nCONTACTS:");
    contacts.slice(0, 8).forEach(function (c) {
      var tag = [];
      if (c.is_primary) tag.push("primary");
      if (c.relationship_role === "champion") tag.push("CHAMPION");
      if (c.relationship_role === "blocker") tag.push("BLOCKER");
      lines.push("- " + c.name + (c.title ? " (" + c.title + ")" : "") + (tag.length ? " [" + tag.join(", ") + "]" : ""));
    });
  }

  if ((meetings || []).length) {
    lines.push("\nRECENT MEETINGS (newest first):");
    meetings.slice(0, 5).forEach(function (m) {
      var when = m.meeting_date || (m.created_at ? m.created_at.slice(0, 10) : "");
      lines.push("- " + when + (m.title ? " · " + m.title : "") + (m.pip_tone ? " · tone: " + m.pip_tone : ""));
      if (m.pip_summary) lines.push("  " + excerpt(m.pip_summary, 240));
    });
  }

  var open = (tasks || []).filter(function (t) { return !t.done && t.status !== "complete"; });
  if (open.length) {
    lines.push("\nOPEN TASKS:");
    open.slice(0, 12).forEach(function (t) {
      var bits = [t.title || "(untitled)"];
      if (t.due_date) bits.push("due " + t.due_date);
      if (t.is_commitment) bits.push("✦ COMMITMENT");
      if (t.assignee_email) bits.push("→ " + t.assignee_email);
      lines.push("- " + bits.join(" · "));
    });
  }

  if ((projects || []).length) {
    lines.push("\nACTIVE GAUGE PROJECTS:");
    projects.slice(0, 8).forEach(function (p) {
      var latest = Array.isArray(p.status_updates) && p.status_updates.length ? p.status_updates[0] : null;
      lines.push("- " + (p.title || "(untitled)") + " · " + (p.status || "?") +
        (latest ? " · latest: \"" + excerpt(latest.body, 120) + "\"" : ""));
    });
  }

  if ((updates || []).length) {
    lines.push("\nRECENT ACCOUNT UPDATES:");
    updates.slice(0, 3).forEach(function (u) {
      lines.push("- " + (u.update_date || "") + " · " + (u.update_type || "") + ": " + excerpt(u.title || u.description, 120));
    });
  }

  if (stateRow) {
    if (stateRow.lessons_learned) lines.push("\nLESSONS PIP HAS LEARNED ON THIS ACCOUNT:\n" + excerpt(stateRow.lessons_learned, 400));
    if (stateRow.operator_situation) lines.push("\nWHAT PIP SAID LAST RUN (for the 'since last run' delta):\n" + excerpt(stateRow.operator_situation, 300));
  }

  return lines.join("\n");
}

var ACCOUNT_SYSTEM = `You are Pip, an account manager's autonomous chief of staff working the book overnight. You've been handed one account's full context. Do the FIRST DRAFT of the work a sharp AM would do before their day starts.

Return ONLY valid JSON, no prose, no code fences:
{
  "headline": "ONE tight sentence — the high-level read at a glance. The gist a busy AM needs before the detail. No markdown. e.g. 'Drifting — follow-up sent 9 days ago, no movement, 6 tasks still open from ABPA.'",
  "situation": "2-4 sentence read of where this account actually stands right now. Specific. Name people, tasks, numbers. Not a summary of the data — a judgement.",
  "risks": ["short risk phrases — overdue commitments, a blocker, cooling tone, a stuck project. [] if genuinely none."],
  "draft_email": "A ready-to-send follow-up email IF one is clearly warranted (an open commitment, a promised deliverable, a gone-quiet major account). Plain text, no markdown, includes a greeting and sign-off as '[Your name]'. Empty string if no email is warranted today — do NOT manufacture one.",
  "proposed_moves": [
    { "kind": "task" | "reassign" | "due_date" | "project" | "agenda_item", "title": "what to do, imperative", "detail": "one line of why / specifics", "confidence": "high" | "medium" }
  ],
  "agenda": "If this account has a standing cadence, a tight bullet agenda for the next call as a single string with '- ' bullets separated by newlines. Empty string otherwise.",
  "delta": "One sentence: what changed on this account since your last run. If there's no prior run context, describe what's new/notable. Empty string if truly nothing moved."
}

Rules:
- PROPOSE, don't act. Everything you return is a draft the human approves. Never assume it's done.
- Be concrete and honest. If the account is quiet and fine, say so briefly and return an empty draft_email and few/no moves. Don't invent urgency.
- A "commitment" (✦) that's overdue is the most important thing — lead your situation with it and draft the email to close it.
- Keep it tight. This feeds a morning report; the human skims it fast.`;

// admin is the service-role Supabase client, used for folio_errors inserts.
// userId is the owner of the run — included in error rows for triage.
async function runAccountPass(client, admin, userId, ctxText, accountName) {
  var msg = await client.messages.create({
    model: OPERATOR_MODEL,
    max_tokens: 1100,
    system: [{ type: "text", text: ACCOUNT_SYSTEM, cache_control: { type: "ephemeral" } }],
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
    draft_email: typeof parsed.draft_email === "string" ? parsed.draft_email.trim() : "",
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
- set has_draft true on the item whose account you drafted a follow-up for.
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

async function processUser(admin, client, userId, tz) {
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
    .select("id,name,tier,objective,systems,account_type")
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
    catch (e) { console.error("[operator-run] report pass failed", userId, e && e.message); }
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
  var tRes = await admin.from("folio_tasks")
    .select("title,due_date,is_commitment,assignee_email,done,status")
    .eq("account_id", acc.id).limit(40);
  var cRes = await admin.from("folio_contacts")
    .select("name,title,is_primary,relationship_role")
    .eq("account_id", acc.id).limit(20);
  var pRes = await admin.from("gauge_projects")
    .select("title,status,status_updates,account_id,account_ids")
    .or("account_id.eq." + acc.id + ",account_ids.cs.{" + acc.id + "}").limit(20);
  var uRes = await admin.from("folio_account_updates")
    .select("update_date,update_type,title,description")
    .eq("account_id", acc.id).order("update_date", { ascending: false }).limit(3);
  var sRes = await admin.from("folio_pip_account_state")
    .select("lessons_learned,operator_situation").eq("account_id", acc.id).maybeSingle();

  var ctxText = renderAccountContext(
    acc, mRes.data || [], tRes.data || [], cRes.data || [],
    pRes.data || [], uRes.data || [], sRes.data || null, snapshot
  );

  if (userContext) {
    ctxText = "── WHO THE USER IS ──\n" + userContext + "\n\n" + ctxText;
  }
  var out = await runAccountPass(client, admin, userId, ctxText, acc.name);
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
  // Auth: require `Authorization: Bearer <CRON_SECRET>` header ONLY.
  // The ?secret= query-param form has been removed — query params appear in
  // Vercel access logs in plaintext, leaking the secret to log storage.
  // Manual runs: use the Authorization header (e.g. curl -H "Authorization: Bearer …").
  var secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "CRON_SECRET not configured." });
  var authHeader = req.headers.authorization || "";
  var bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer !== secret) return res.status(401).json({ error: "Unauthorized" });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." });

  var tz = process.env.OPERATOR_TZ || "America/New_York";

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Distinct users with at least one account. Optional ?user= scopes a manual run.
    var onlyUser = (req.query && req.query.user) || null;
    var userIds = [];
    if (onlyUser) {
      userIds = [onlyUser];
    } else {
      var uRes = await admin.from("folio_accounts").select("user_id").limit(50000);
      var seen = {};
      (uRes.data || []).forEach(function (r) {
        if (r.user_id && !seen[r.user_id]) { seen[r.user_id] = true; userIds.push(r.user_id); }
      });
    }
    userIds = userIds.slice(0, MAX_USERS);

    var results = [];
    for (var i = 0; i < userIds.length; i++) {
      try {
        results.push(await processUser(admin, client, userIds[i], tz));
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
