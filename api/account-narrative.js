// Account Narrative Memory — synthesis endpoint (Stage 2 of audit improvement #17).
//
// POST { accountIds: string[] (cap 12), force? }
// → For each account whose content fingerprint changed since the stored
//   narrative was derived, RE-DERIVE a structured 4-part story (arc / standing /
//   hinges-on / trajectory) from the evidence floor and persist it to
//   folio_pip_account_state.{narrative, narrative_fingerprint, narrative_at}.
//
// This handler is the CLIENT (app-open) path; the overnight cron seeds the same
// stories via api/operator-run.js. BOTH call the shared deriveNarratives helper
// (api/_narrativeSynth.js) so the fingerprint is computed from an identical
// evidence load and the two paths never re-derive each other's work.
//
// LOCKED DESIGN: re-derived, NEVER accumulating (bias-lock guard); fingerprint
// computed server-side only (F3 anti-divergence); DATA LINE enforced in the
// prompt (this reads the most account text in the app).

import { createClient } from "@supabase/supabase-js";
import { overDailySpendCap } from "./_pipUsage.js";
import { deriveNarratives } from "./_narrativeSynth.js";

// Note: the Anthropic SDK + usage metering live in _narrativeSynth.js (the
// shared helper this endpoint and the operator cron both call), so this file
// doesn't construct the client itself.

export const config = { maxDuration: 60 };

var MAX_BATCH = 12;

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

    // Spend cap — degrade to no-op (the story isn't urgent; never break the day).
    if (!force && await overDailySpendCap(supabase, user.id)) {
      return res.status(200).json({ skipped: "spend_cap" });
    }

    var out = await deriveNarratives({ db: supabase, userId: user.id, accountIds: accountIds, force: force });
    if (out.notMigrated) return res.status(200).json({ skipped: "not_migrated" });

    return res.status(200).json({ ok: true, derived: out.derived, skipped: out.skipped });
  } catch (err) {
    console.error("[account-narrative] error:", err && err.message);
    return res.status(500).json({ error: "Pip couldn't write the account story right now.", detail: err && err.message });
  }
}
