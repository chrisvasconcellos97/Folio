// Account Narrative synthesis — SHARED server helper.
//
// One implementation of "re-derive each account's standing story from the
// evidence floor", used by BOTH:
//   - api/account-narrative.js  (client app-open sweep, user-JWT client)
//   - api/operator-run.js       (overnight cron, service-role admin client)
//
// Centralizing it here means the fingerprint is computed from the SAME evidence
// load on both paths — so a story seeded by the cron and one seeded on app-open
// agree on the content hash and never re-derive each other (App Coherence). The
// `_` prefix keeps the Anthropic SDK import out of any client bundle.
//
// LOCKED DESIGN: re-derived, never accumulating (bias-lock guard); fingerprint
// computed server-side only; DATA LINE enforced in the prompt.

import Anthropic from "@anthropic-ai/sdk";
import { renderAccountContext, computeContextFingerprint } from "../src/lib/accountContext.js";
import { parseNarrativeResponse } from "../src/lib/accountNarrative.js";
import { logPipUsage } from "./_pipUsage.js";

export var NARRATIVE_MODEL = process.env.PIP_NARRATIVE_MODEL || "claude-sonnet-4-6";
var MAX_TOKENS = 700;
var MAX_BATCH  = 12;          // Sonnet — smaller cap than state-refresh's 50.
var ACCOUNT_CONCURRENCY = 4;

export var NARRATIVE_SYSTEM = [
  "You are Pip, a sharp, loyal chief-of-staff for an account manager. You are writing the STANDING STORY of one account — the thing that lets the user walk in knowing it cold.",
  "",
  "You are given the current evidence for the account (recent meetings + notes, logged updates, open commitments, who-has-the-ball, delivery track record, relationships, health trend). DERIVE the story FRESH from this evidence — do not assume any prior narrative; this is a clean read of where things stand right now.",
  "",
  "Return ONLY this JSON, no prose, no code fences:",
  '{ "arc": "...", "standing": "...", "hinges_on": "...", "trajectory": "warming|cooling|steady", "trajectory_why": "...", "as_of": "YYYY-MM-DD" }',
  "",
  "- arc: how the relationship got to where it is — 1-2 sentences, the throughline (began at X, strong early, slowed on Y, re-engaged...). Empty string if there's genuinely too little history.",
  "- standing: where it stands RIGHT NOW — 1-2 sentences. The single most important field. What's live, who's the active POC, what's open.",
  "- hinges_on: the 1-2 things the relationship actually turns on next (a deliverable, a decision, a person). One line.",
  "- trajectory: warming | cooling | steady — the direction, read from recency, tone, momentum, kept-vs-slipped commitments.",
  "- trajectory_why: one short clause of evidence for the trajectory.",
  "- as_of: the date of the newest piece of evidence you used (YYYY-MM-DD).",
  "",
  "RULES:",
  "- GROUNDED: every claim must trace to the evidence given. Never invent people, causes, or events. If you can't tell, say so plainly in `standing` and keep the rest short.",
  "- STALENESS-HUMBLE: if the newest evidence is old, the story is a read 'as of' then, not a confident present-tense claim.",
  "- DATA LINE (hard): NEVER include revenue, transaction volumes, customer/shop counts, shop lists, pricing, or contract terms. Generalize to qualitative — 'volume healthy', 'high-volume supplier' — never a figure. The user's notes may contain numbers; your story must not.",
  "- If RELATIONSHIP_OWNER: NO appears in the evidence, this account is managed by someone else — frame the story as project-involvement, not the user's relationship to run.",
].join("\n");

function systemBlocks() {
  return [{ type: "text", text: NARRATIVE_SYSTEM, cache_control: { type: "ephemeral" } }];
}

function byAcct(arr) {
  var out = {};
  (arr || []).forEach(function (r) { (out[r.account_id] || (out[r.account_id] = [])).push(r); });
  return out;
}

function maxDate(rows, fields) {
  var max = "";
  (rows || []).forEach(function (r) {
    fields.forEach(function (f) {
      var v = r && r[f];
      if (v) { v = String(v).slice(0, 10); if (v > max) max = v; }
    });
  });
  return max || null;
}

// deriveNarratives({ client, db, userId, accountIds, force?, deadlineAt? })
//   client     — Anthropic instance
//   db         — Supabase client (user-JWT for the endpoint, service-role for cron)
//   accountIds — up to 12; the load batches them in one query set
//   force      — bypass the fingerprint gate
//   deadlineAt — wall-clock ms; stop launching waves once exceeded (cron budget)
// Returns { derived, skipped, notMigrated }. Never throws on a per-account
// failure (leaves the prior story untouched); throws only on a fatal load error.
export async function deriveNarratives(opts) {
  // Reuse the caller's Anthropic client when given (operator-run shares one
  // across its passes); otherwise build one (the endpoint path).
  var client     = opts.client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  var db         = opts.db;
  var userId     = opts.userId;
  var accountIds = (opts.accountIds || []).filter(function (x) { return typeof x === "string" && x; }).slice(0, MAX_BATCH);
  var force      = opts.force === true;
  var deadlineAt = opts.deadlineAt || 0;
  if (!accountIds.length) return { derived: 0, skipped: 0 };

  // Pre-migration guard: if the narrative columns don't exist yet, bail BEFORE
  // any Sonnet call. Keeps the feature fail-soft + zero-cost until
  // supabase/account_narrative.sql is applied to prod.
  var stateSel = await db.from("folio_pip_account_state")
    .select("account_id, narrative_fingerprint").in("account_id", accountIds);
  if (stateSel.error) {
    var m = (stateSel.error.message || "").toLowerCase();
    if (m.indexOf("narrative_fingerprint") !== -1 || stateSel.error.code === "42703") {
      return { derived: 0, skipped: 0, notMigrated: true };
    }
    throw stateSel.error;
  }
  var fpByAcct = {};
  (stateSel.data || []).forEach(function (s) { fpByAcct[s.account_id] = s; });

  // Evidence floor — same shape buildAccountContext consumes. The full account
  // field set here is what keeps the fingerprint identical across both callers.
  var r = await Promise.all([
    db.from("folio_accounts").select("id, name, status, status_override, status_override_reason, last_interaction_at, tier, account_type, owner_user_id, systems, objective, health").in("id", accountIds),
    db.from("folio_meetings").select("account_id, id, meeting_date, created_at, updated_at, title, notes, pip_summary, pip_tone, theme").in("account_id", accountIds).order("meeting_date", { ascending: false }).limit(200),
    db.from("folio_tasks").select("account_id, title, due_date, done, status, updated_at, created_at, is_commitment, waiting_on, waiting_on_since, assignee_email").in("account_id", accountIds).eq("done", false).is("project_id", null),
    db.from("folio_contacts").select("account_id, name, title, is_poc, is_primary, relationship_role, relationship_note").in("account_id", accountIds),
    db.from("folio_account_updates").select("account_id, update_date, update_type, title, description, observed_impact").in("account_id", accountIds).order("update_date", { ascending: false }).limit(200),
  ]);
  if (r[0].error) throw r[0].error;
  var accts = r[0].data || [];
  var mBy = byAcct(r[1].data), iBy = byAcct(r[2].data), cBy = byAcct(r[3].data), uBy = byAcct(r[4].data);

  var projects = [];
  try {
    var pj = await db.from("gauge_projects")
      .select("account_id, title, status, status_updates, waiting_on, waiting_on_since, due_date")
      .or(accountIds.map(function (id) { return "account_id.eq." + id; }).join(",")).neq("status", "complete");
    if (!pj.error) projects = pj.data || [];
  } catch (e) { /* projects optional */ }
  var pBy = byAcct(projects);

  var derived = 0, skipped = 0;
  var nowIso = new Date().toISOString();

  var calls = accts.map(function (a) {
    var rawBundle = {
      account: a, meetings: mBy[a.id] || [], tasks: iBy[a.id] || [],
      contacts: cBy[a.id] || [], projects: pBy[a.id] || [], updates: uBy[a.id] || [],
    };
    var fp = computeContextFingerprint(rawBundle);
    var prior = fpByAcct[a.id];

    // fingerprint gate — skip the Sonnet call when content is unchanged; bump
    // narrative_at so the client stops re-firing until the next real signal.
    if (!force && prior && prior.narrative_fingerprint && prior.narrative_fingerprint === fp) {
      skipped++;
      return function () {
        return db.from("folio_pip_account_state").update({ narrative_at: nowIso }).eq("account_id", a.id)
          .then(function () {}, function () {});
      };
    }

    // content changed (or forced) — re-derive from the evidence floor.
    return function () {
      var evidence = renderAccountContext({
        id: a.id, name: a.name, account_type: a.account_type, tier: a.tier,
        status: a.status, health: a.health, status_override: a.status_override,
        status_override_reason: a.status_override_reason, last_interaction_at: a.last_interaction_at,
        owner_user_id: a.owner_user_id, objective: a.objective, systems: a.systems,
        meetings: (mBy[a.id] || []).map(function (mm) {
          return { date: mm.meeting_date, title: mm.title, notes: mm.notes, summary: mm.pip_summary, theme: mm.theme, tone: mm.pip_tone };
        }),
        openItems: iBy[a.id] || [], contacts: cBy[a.id] || [],
        activeProjects: pBy[a.id] || [], recentUpdates: uBy[a.id] || [],
      }, { surface: "chat", includeNarrative: false, includeRecall: false, includeScheduled: false, userId: userId });

      return client.messages.create({
        model: NARRATIVE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        system: systemBlocks(),
        messages: [{ role: "user", content: "ACCOUNT EVIDENCE:\n" + evidence + "\n\nDerive the standing story now. JSON only." }],
      }).then(function (resp) {
        logPipUsage(db, userId, "account-narrative", "narrative", NARRATIVE_MODEL, resp.usage);
        var text = "";
        if (Array.isArray(resp.content)) resp.content.forEach(function (b) { if (b.type === "text" && b.text) text += b.text; });
        var narrative = parseNarrativeResponse(text);
        if (!narrative) return null; // unparseable → leave the prior story untouched
        if (!narrative.as_of) narrative.as_of = maxDate(mBy[a.id], ["meeting_date"]) || maxDate(uBy[a.id], ["update_date"]) || nowIso.slice(0, 10);

        var fields = { narrative: narrative, narrative_fingerprint: fp, narrative_at: nowIso };
        derived++;
        if (prior) {
          return db.from("folio_pip_account_state").update(fields).eq("account_id", a.id).then(function () {}, function () {});
        }
        return db.from("folio_pip_account_state").insert(Object.assign({
          account_id: a.id, user_id: userId, state_prose: "(narrative)", generated_at: nowIso,
        }, fields)).then(function () {}, function () {});
      }).catch(function (err) {
        console.error("[narrativeSynth] per-account failed", a.id, err && err.message);
        return null;
      });
    };
  });

  // Bounded-concurrency waves; honor the wall-clock deadline (cron budget) by
  // stopping BEFORE launching a wave once we're out of time. Already-skipped
  // (fingerprint-gated) accounts are cheap DB touches — run them regardless.
  for (var wi = 0; wi < calls.length; wi += ACCOUNT_CONCURRENCY) {
    if (deadlineAt && Date.now() > deadlineAt) break;
    await Promise.all(calls.slice(wi, wi + ACCOUNT_CONCURRENCY).map(function (fn) { return fn(); }));
  }

  return { derived: derived, skipped: skipped };
}
