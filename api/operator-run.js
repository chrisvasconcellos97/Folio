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
// CRON_SECRET is set in the project env. We also accept `?secret=<CRON_SECRET>`
// so the run can be triggered manually for testing. Reads/writes use the
// service-role key (RLS bypassed) because there is no user session.
//
// This handler is intentionally self-contained (no src/lib imports) so it can
// never trip the ESM .js-extension bundling rule. It is registered in
// scripts/test-api-imports.js.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

var OPERATOR_MODEL = process.env.PIP_OPERATOR_MODEL || "claude-sonnet-4-6";
var MAX_DEEP_PER_USER = 12;       // cap deep per-account passes per user per night
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

function isWeekendMorning(weekday) {
  // The cron fires in the early morning. Saturday morning = Friday night's
  // work; Sunday morning = Saturday night's. Those are the gated runs.
  return weekday === "Sat" || weekday === "Sun";
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

async function runAccountPass(client, ctxText) {
  var msg = await client.messages.create({
    model: OPERATOR_MODEL,
    max_tokens: 1100,
    system: [{ type: "text", text: ACCOUNT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: ctxText }],
  });
  var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
  var parsed = safeJsonParse(raw) || {};
  return {
    situation: typeof parsed.situation === "string" ? parsed.situation : "",
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter(function (r) { return typeof r === "string" && r.trim(); }) : [],
    draft_email: typeof parsed.draft_email === "string" ? parsed.draft_email.trim() : "",
    proposed_moves: Array.isArray(parsed.proposed_moves) ? parsed.proposed_moves.slice(0, 8) : [],
    agenda: typeof parsed.agenda === "string" ? parsed.agenda.trim() : "",
    delta: typeof parsed.delta === "string" ? parsed.delta.trim() : "",
  };
}

var REPORT_SYSTEM = `You are Pip delivering your morning operator report to the account manager you work for. You ALREADY did the overnight work per account — now hand them the prioritized plan, the way a chief of staff drops a brief on the desk before the day starts.

You get a list of accounts you worked, each with your situation read, risks, whether you drafted a follow-up email, and proposed moves.

Return ONLY valid JSON, no code fences:
{
  "headline": "ONE bold sentence capturing the day. No markdown asterisks — just the sentence.",
  "report_prose": "Markdown. Open with the headline as a bold line. Then ONLY the sections that have content, each a '## ' header with exactly one glyph token: '## :fire: Needs you today', '## :watch: This week', '## :win: Good news', '## :signal: Pattern'. Under each, '- ' bullets. Bold account/person names. When you drafted a follow-up for an account, say so and tell them to approve/send it. Put every header and bullet on its own line with real newlines. Keep a clean day short — don't manufacture sections.",
  "plan_items": [
    { "account_name": "exact name", "priority": "now" | "this_week" | "watch", "action": "1-3 word verb phrase", "reason": "short phrase", "has_draft": true | false }
  ]
}

Rules:
- Glyph tokens ONLY :fire: :watch: :win: :signal:, ONLY right after '## '. Never elsewhere, never a unicode emoji.
- Lead with overdue commitments and active fires. Wins go last, never first. Major-tier accounts outrank Mid/Growth.
- plan_items: one per account worth a tap, sorted now → this_week → watch. Set has_draft true when you drafted that account's email.
- This is a plan of work you've already started, not a dashboard. Sound like a trusted colleague: direct, specific, a little dry.`;

async function runReportPass(client, workedSummaries, totalAccounts) {
  var body = "Accounts you worked tonight (" + workedSummaries.length + " of " + totalAccounts + " in the book):\n\n" +
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
    max_tokens: 1400,
    system: [{ type: "text", text: REPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: body }],
  });
  var raw = msg.content && msg.content[0] && msg.content[0].type === "text" ? msg.content[0].text : "";
  var parsed = safeJsonParse(raw) || {};
  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    report_prose: typeof parsed.report_prose === "string" ? parsed.report_prose : "",
    plan_items: Array.isArray(parsed.plan_items) ? parsed.plan_items : [],
  };
}

// Decide which accounts "moved" since the last run.
function pickMovedAccounts(accounts, activitySinceIds, snapshotsById, lastRunIso) {
  var moved = [];
  var seen = {};
  function add(a) { if (a && !seen[a.id]) { seen[a.id] = true; moved.push(a); } }

  // 1. Accounts with logged activity since the last run.
  accounts.forEach(function (a) { if (activitySinceIds[a.id]) add(a); });

  // 2. Accounts whose latest snapshot is at_risk / watching — always worth a look.
  accounts.forEach(function (a) {
    var s = snapshotsById[a.id];
    if (s && (s.health_status === "at_risk" || s.health_status === "watching")) add(a);
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

  // Last run = most recent operator report for this user.
  var lastRunIso = null;
  var lastRes = await admin.from("folio_operator_reports")
    .select("generated_at").eq("user_id", userId)
    .order("generated_at", { ascending: false }).limit(1);
  if (lastRes.data && lastRes.data[0]) lastRunIso = lastRes.data[0].generated_at;

  var ranReason = "weeknight";

  // Weekend opt-in gate.
  if (isWeekendMorning(local.weekday)) {
    var sinceIso = lastRunIso || new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    var act = await admin.from("folio_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).gt("created_at", sinceIso);
    var n = typeof act.count === "number" ? act.count : 0;
    if (n === 0) return { userId: userId, skipped: "weekend-idle", weekday: local.weekday };
    ranReason = "weekend-activity";
  }

  // Load the active book.
  var accRes = await admin.from("folio_accounts")
    .select("id,name,tier,objective,systems,account_type")
    .eq("user_id", userId)
    .or("is_inactive.is.null,is_inactive.eq.false");
  var accounts = (accRes.data || []).filter(function (a) { return a.account_type !== "internal_team"; });
  if (!accounts.length) return { userId: userId, skipped: "no-accounts" };

  // Activity since last run → which accounts moved.
  var activitySinceIds = {};
  if (lastRunIso) {
    var aRes = await admin.from("folio_activity")
      .select("account_id").eq("user_id", userId).gt("created_at", lastRunIso).not("account_id", "is", null).limit(2000);
    (aRes.data || []).forEach(function (r) { if (r.account_id) activitySinceIds[r.account_id] = true; });
  }

  // Today's snapshots, indexed by account.
  var snapById = {};
  var snapRes = await admin.from("folio_account_snapshots")
    .select("account_id,health_status,days_since_contact,overdue_item_count")
    .eq("user_id", userId).eq("snapshot_date", local.date);
  (snapRes.data || []).forEach(function (s) { snapById[s.account_id] = s; });

  var moved = pickMovedAccounts(accounts, activitySinceIds, snapById, lastRunIso);

  // Deep pass per moved account.
  var worked = [];
  for (var i = 0; i < moved.length; i++) {
    var acc = moved[i];
    try {
      var ctx = await gatherAndRun(admin, client, userId, acc, snapById[acc.id]);
      worked.push(Object.assign({ id: acc.id, name: acc.name, tier: acc.tier, has_draft: !!ctx.draft_email }, ctx));
    } catch (e) {
      console.error("[operator-run] account pass failed", acc.id, e && e.message);
    }
  }

  // Portfolio report.
  var report = { headline: "", report_prose: "", plan_items: [] };
  if (worked.length) {
    try { report = await runReportPass(client, worked, accounts.length); }
    catch (e) { console.error("[operator-run] report pass failed", userId, e && e.message); }
  }

  await admin.from("folio_operator_reports").upsert({
    user_id: userId,
    report_date: local.date,
    headline: report.headline,
    report_prose: report.report_prose,
    plan_items: report.plan_items,
    accounts_worked: worked.length,
    accounts_total: accounts.length,
    ran_reason: ranReason,
    generated_at: new Date().toISOString(),
  }, { onConflict: "user_id,report_date" });

  return { userId: userId, worked: worked.length, total: accounts.length, ranReason: ranReason };
}

// Gather one account's context, run the deep pass, persist operator state.
async function gatherAndRun(admin, client, userId, acc, snapshot) {
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

  var out = await runAccountPass(client, ctxText);

  // Persist operator state. Insert a fresh row if none exists (state_prose is
  // NOT NULL → seed it from the situation); otherwise update operator_* only.
  var existing = await admin.from("folio_pip_account_state")
    .select("account_id").eq("account_id", acc.id).maybeSingle();
  var fields = {
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
  // Auth: Vercel cron Bearer OR ?secret= for manual triggering.
  var secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "CRON_SECRET not configured." });
  var authHeader = req.headers.authorization || "";
  var bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  var qSecret = (req.query && req.query.secret) || null;
  if (bearer !== secret && qSecret !== secret) return res.status(401).json({ error: "Unauthorized" });

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
