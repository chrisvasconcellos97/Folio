// Account Narrative Memory — synthesis endpoint (Stage 2 of audit improvement #17).
//
// POST { accountIds: string[] (cap 12), force? }
// → For each account whose content fingerprint changed since the stored
//   narrative was derived, RE-DERIVE a structured 4-part story (arc / standing /
//   hinges-on / trajectory) from the evidence floor and persist it to
//   folio_pip_account_state.{narrative, narrative_fingerprint, narrative_at}.
//
// LOCKED DESIGN: re-derived, NEVER accumulating — each rebuild discards the prior
// story and reads the evidence fresh, so a wrong conclusion can't lodge as a
// permanent lens (bias-lock). The fingerprint is computed SERVER-SIDE only (F3
// anti-divergence rule); the client gates on signal-time and the server skips the
// Sonnet call when the content hash is unchanged.
//
// DATA LINE: this reads a lot of account text (the highest retention pressure in
// the app) — the prompt MUST generalize every figure to qualitative.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { logPipUsage, overDailySpendCap } from "./_pipUsage.js";
import { renderAccountContext, computeContextFingerprint } from "../src/lib/accountContext.js";
import { parseNarrativeResponse } from "../src/lib/accountNarrative.js";

export const config = { maxDuration: 60 };

// Sonnet — this is synthesis-with-judgment (the longitudinal read), same class as
// summarize. Event-gated + fingerprint-skipped, so it only bills on real change.
var NARRATIVE_MODEL = process.env.PIP_NARRATIVE_MODEL || "claude-sonnet-4-6";
var MAX_TOKENS = 700;
var MAX_BATCH  = 12; // Sonnet — smaller cap than state-refresh's 50.
var ACCOUNT_CONCURRENCY = 4;

var SYSTEM = [
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
  return [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }];
}

var rateLimitMap = new Map();
var RL_WINDOW_MS = 60 * 1000;
var RL_MAX = 10;
function isRateLimited(userId) {
  var now = Date.now();
  var ts = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < RL_WINDOW_MS; });
  if (ts.length >= RL_MAX) return true;
  ts.push(now);
  rateLimitMap.set(userId, ts);
  return false;
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });

  var token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    var authClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var userRes = await authClient.auth.getUser(token);
    var user = userRes.data && userRes.data.user ? userRes.data.user : null;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (isRateLimited(user.id)) return res.status(429).json({ error: "rate_limited" });

    var supabase = createClient(
      process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } }
    );

    var body = req.body || {};
    var accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.filter(function (x) { return typeof x === "string" && x.length > 0; }).slice(0, MAX_BATCH)
      : [];
    if (!accountIds.length) return res.status(400).json({ error: "accountIds required" });
    var force = body.force === true;

    // ── Pre-migration guard: if the narrative columns don't exist yet, bail
    //    BEFORE any Sonnet call. Keeps the feature fail-soft + zero-cost until
    //    supabase/account_narrative.sql is applied to prod.
    var stateSel = await supabase.from("folio_pip_account_state")
      .select("account_id, narrative_fingerprint").in("account_id", accountIds);
    if (stateSel.error) {
      var msg = (stateSel.error.message || "").toLowerCase();
      if (msg.indexOf("narrative_fingerprint") !== -1 || stateSel.error.code === "42703") {
        return res.status(200).json({ skipped: "not_migrated" });
      }
      throw stateSel.error;
    }
    var fpByAcct = {};
    (stateSel.data || []).forEach(function (s) { fpByAcct[s.account_id] = s; });

    // Spend cap — degrade to no-op (the story isn't urgent; never break the day).
    if (!force && await overDailySpendCap(supabase, user.id)) {
      return res.status(200).json({ skipped: "spend_cap" });
    }

    // Evidence floor — same shape buildAccountContext consumes.
    var r = await Promise.all([
      supabase.from("folio_accounts").select("id, name, status, status_override, status_override_reason, last_interaction_at, tier, account_type, owner_user_id, systems, objective, health").in("id", accountIds),
      supabase.from("folio_meetings").select("account_id, id, meeting_date, created_at, updated_at, title, notes, pip_summary, pip_tone, theme").in("account_id", accountIds).order("meeting_date", { ascending: false }).limit(200),
      supabase.from("folio_tasks").select("account_id, title, due_date, done, status, updated_at, created_at, is_commitment, waiting_on, waiting_on_since, assignee_email").in("account_id", accountIds).eq("done", false).is("project_id", null),
      supabase.from("folio_contacts").select("account_id, name, title, is_poc, is_primary, relationship_role, relationship_note").in("account_id", accountIds),
      supabase.from("folio_account_updates").select("account_id, update_date, update_type, title, description, observed_impact").in("account_id", accountIds).order("update_date", { ascending: false }).limit(200),
    ]);
    if (r[0].error) throw r[0].error;
    var accts = r[0].data || [];
    var mBy = byAcct(r[1].data), iBy = byAcct(r[2].data), cBy = byAcct(r[3].data), uBy = byAcct(r[4].data);

    var projects = [];
    try {
      var pj = await supabase.from("gauge_projects")
        .select("account_id, title, status, status_updates, waiting_on, waiting_on_since, due_date")
        .or(accountIds.map(function (id) { return "account_id.eq." + id; }).join(",")).neq("status", "complete");
      if (!pj.error) projects = pj.data || [];
    } catch (e) { /* projects optional */ }
    var pBy = byAcct(projects);

    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var derived = 0, skipped = 0;
    var nowIso = new Date().toISOString();

    var calls = accts.map(function (a) {
      var rawBundle = {
        account: a, meetings: mBy[a.id] || [], tasks: iBy[a.id] || [],
        contacts: cBy[a.id] || [], projects: pBy[a.id] || [], updates: uBy[a.id] || [],
      };
      var fp = computeContextFingerprint(rawBundle);
      var prior = fpByAcct[a.id];

      // ── fingerprint gate — skip the Sonnet call when content is unchanged.
      //    Bump narrative_at (checkpoint) so the client stops re-firing until the
      //    next real signal. Only rows that already exist reach this branch.
      if (!force && prior && prior.narrative_fingerprint && prior.narrative_fingerprint === fp) {
        skipped++;
        return supabase.from("folio_pip_account_state").update({ narrative_at: nowIso }).eq("account_id", a.id)
          .then(function () {}, function () {});
      }

      // ── content changed (or forced) — re-derive from the evidence floor.
      var evidence = renderAccountContext({
        id: a.id, name: a.name, account_type: a.account_type, tier: a.tier,
        status: a.status, health: a.health, status_override: a.status_override,
        status_override_reason: a.status_override_reason, last_interaction_at: a.last_interaction_at,
        owner_user_id: a.owner_user_id, objective: a.objective, systems: a.systems,
        meetings: (mBy[a.id] || []).map(function (m) {
          return { date: m.meeting_date, title: m.title, notes: m.notes, summary: m.pip_summary, theme: m.theme, tone: m.pip_tone };
        }),
        openItems: iBy[a.id] || [], contacts: cBy[a.id] || [],
        activeProjects: pBy[a.id] || [], recentUpdates: uBy[a.id] || [],
      }, { surface: "chat", includeNarrative: false, includeRecall: false, includeScheduled: false, userId: user.id });

      return client.messages.create({
        model: NARRATIVE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        system: systemBlocks(),
        messages: [{ role: "user", content: "ACCOUNT EVIDENCE:\n" + evidence + "\n\nDerive the standing story now. JSON only." }],
      }).then(function (resp) {
        logPipUsage(supabase, user.id, "account-narrative", "narrative", NARRATIVE_MODEL, resp.usage);
        var text = "";
        if (Array.isArray(resp.content)) resp.content.forEach(function (b) { if (b.type === "text" && b.text) text += b.text; });
        var narrative = parseNarrativeResponse(text);
        if (!narrative) { return null; } // unparseable → leave the prior story untouched
        if (!narrative.as_of) narrative.as_of = maxDate(mBy[a.id], ["meeting_date"]) || maxDate(uBy[a.id], ["update_date"]) || nowIso.slice(0, 10);

        var fields = { narrative: narrative, narrative_fingerprint: fp, narrative_at: nowIso };
        derived++;
        if (prior) {
          return supabase.from("folio_pip_account_state").update(fields).eq("account_id", a.id).then(function () {}, function () {});
        }
        // No state row yet — insert one (state_prose is NOT NULL → seed it).
        return supabase.from("folio_pip_account_state").insert(Object.assign({
          account_id: a.id, user_id: user.id, state_prose: "(narrative)", generated_at: nowIso,
        }, fields)).then(function () {}, function () {});
      }).catch(function (err) {
        console.error("[account-narrative] per-account failed", a.id, err && err.message);
        return null;
      });
    });

    for (var wi = 0; wi < calls.length; wi += ACCOUNT_CONCURRENCY) {
      await Promise.all(calls.slice(wi, wi + ACCOUNT_CONCURRENCY));
    }

    return res.status(200).json({ ok: true, derived: derived, skipped: skipped });
  } catch (err) {
    console.error("[account-narrative] error:", err && err.message);
    return res.status(500).json({ error: "Pip couldn't write the account story right now.", detail: err && err.message });
  }
}
