// useMondayPack — gathers the week's data for the Monday 1:1 pack, builds the
// deterministic sections (free, always fresh), and fetches/caches the ONE Sonnet
// output (read + boss-asks) gated by a content fingerprint (F3 event-driven).
//
// Used by MondayPackSection (in the 1:1 hub) and the Home MondayPackCard. Both
// route through this one hook (App Coherence). The first to run with a changed
// fingerprint triggers the model call + writes the cache to folio_cadences; the
// other reads the fresh cache (same fingerprint → no call). A quiet week = $0.

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { startOfWeek } from "../lib/cadenceUtils";
import { buildPackSections, computePackFingerprint, buildPackPromptPayload } from "../lib/mondayPack";
import { callMondayPackPip } from "../lib/pip";

function isoDay(d) {
  if (!d) return "";
  var x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function useMondayPack(userId, cadence, opts) {
  opts = opts || {};
  var accounts     = opts.accounts || [];
  var profileProse = opts.profileProse || null;
  var facts        = opts.facts || null;
  var personName   = opts.personName || null;

  var [bundle, setBundle]   = useState(null);   // the gathered window data
  var [model, setModel]     = useState(null);   // { read, boss_asks } from cache or fresh
  var [loading, setLoading] = useState(false);  // model call in flight
  var [error, setError]     = useState(null);
  var generatingRef = useRef(false);

  var cadenceId = cadence ? cadence.id : null;
  var frequency = cadence ? cadence.frequency : null;

  // ── gather the windowed data ──
  var gather = useCallback(function () {
    if (!userId || !cadenceId) { setBundle(null); return; }
    var today = new Date();
    var thisMonday = isoDay(startOfWeek(today)); // week anchor (rollover gate)
    var windowDays = frequency === "biweekly" ? 14 : 7;
    var windowStart = isoDay(new Date(today.getTime() - windowDays * 86400000));
    var windowStartTs = windowStart + "T00:00:00";

    Promise.all([
      // A — folio_tasks relevant to the window: commitments, waiting-ons, deliveries
      supabase.from("folio_tasks")
        .select("id, account_id, title, status, done, closed_at, due_date, is_commitment, waiting_on, waiting_on_since, updated_at, created_at")
        .eq("user_id", userId)
        .or("is_commitment.eq.true,waiting_on.not.is.null,closed_at.gte." + windowStartTs)
        .limit(400),
      // B — meetings in the window
      supabase.from("folio_meetings")
        .select("id, account_id, title, meeting_date, status, updated_at, created_at")
        .eq("user_id", userId)
        .gte("meeting_date", windowStart)
        .limit(200),
      // C — projects (active + completed; for pulses, waiting-ons, deliveries)
      supabase.from("gauge_projects")
        .select("id, account_id, title, status, status_updates, waiting_on, waiting_on_since, updated_at")
        .eq("user_id", userId)
        .limit(200),
      // D — leadership tasks tagged to THIS 1:1 cadence (boss-ask source half)
      supabase.from("folio_tasks")
        .select("id, title, due_date, updated_at, created_at")
        .eq("user_id", userId)
        .eq("cadence_id", cadenceId)
        .is("account_id", null)
        .eq("done", false)
        .limit(30),
      // E — the most recent 1:1 on this cadence (boss-ask source half)
      supabase.from("folio_meetings")
        .select("id, title, meeting_date, notes, pip_summary, updated_at")
        .eq("user_id", userId)
        .eq("cadence_id", cadenceId)
        .order("meeting_date", { ascending: false })
        .limit(5),
      // F — wins logged in the window (brag file → the read credits what went right)
      supabase.from("folio_wins")
        .select("id, title, created_at")
        .eq("user_id", userId)
        .gte("created_at", windowStartTs)
        .order("created_at", { ascending: false })
        .limit(20),
    ]).then(function (results) {
      var rowsA  = (results[0].data) || [];
      var mtgs   = (results[1].data) || [];
      var projs  = (results[2].data) || [];
      var lead   = (results[3].data) || [];
      var ones   = (results[4].data) || [];
      var wins   = (results[5] && results[5].data) || [];

      var accountsById = {};
      (accounts || []).forEach(function (a) { if (a && a.id) accountsById[a.id] = a.name; });

      var lastOneOnOne = null;
      for (var i = 0; i < ones.length; i++) {
        if (ones[i] && (ones[i].notes || ones[i].pip_summary)) { lastOneOnOne = ones[i]; break; }
      }

      setBundle({
        windowStart: windowStart,
        weekAnchor: thisMonday,
        today: isoDay(today),
        commitments: rowsA.filter(function (t) { return t && t.is_commitment; }),
        tasks: rowsA,
        meetings: mtgs,
        projects: projs,
        leadershipTasks: lead,
        wins: wins,
        lastOneOnOne: lastOneOnOne,
        accountsById: accountsById,
      });
    }).catch(function (e) { setError(e.message || "Couldn't load the pack data."); });
  }, [userId, cadenceId, frequency, accounts]);

  useEffect(function () { gather(); }, [gather]);

  // ── deterministic sections (free, always fresh) ──
  var sections = bundle ? buildPackSections(bundle) : null;
  var fingerprint = bundle ? computePackFingerprint(bundle) : null;

  // ── model output: cache hit, or generate + write back ──
  var runModel = useCallback(function (force) {
    if (!bundle || !cadence || generatingRef.current) return;
    var weekAnchor = bundle.weekAnchor;
    var cached = cadence.pack || null;
    var cacheFresh = !force && cached &&
      cadence.pack_week === weekAnchor &&
      cadence.pack_fingerprint === fingerprint;
    if (cacheFresh) { setModel(cached); return; }
    // Stale or missing → one Sonnet call.
    generatingRef.current = true;
    setLoading(true);
    setError(null);
    var payload = buildPackPromptPayload(bundle, sections);
    payload.personName   = personName;
    payload.profileProse = profileProse;
    payload.facts        = facts;
    callMondayPackPip(payload).then(function (out) {
      var packOut = { read: out.read || "", boss_asks: Array.isArray(out.boss_asks) ? out.boss_asks : [] };
      setModel(packOut);
      // Write the cache back to the cadence row (RLS = user_id).
      supabase.from("folio_cadences").update({
        pack: packOut,
        pack_fingerprint: fingerprint,
        pack_generated_at: new Date().toISOString(),
        pack_week: weekAnchor,
      }).eq("id", cadence.id).then(function () {});
    }).catch(function (e) {
      // Sanity-Pass: model failure never blocks the pack — fall back to the last
      // cached read (if any) and let the deterministic sections carry the pack.
      setError(e.message || "Pip couldn't refresh the read.");
      if (cached) setModel(cached);
    }).finally(function () {
      generatingRef.current = false;
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, fingerprint, cadence && cadence.id, cadence && cadence.pack_week, cadence && cadence.pack_fingerprint]);

  useEffect(function () { runModel(false); }, [runModel]);

  return {
    sections: sections,
    read: model ? model.read : null,
    bossAsks: model ? (model.boss_asks || []) : [],
    loading: loading,
    error: error,
    generatedAt: cadence ? cadence.pack_generated_at : null,
    refresh: function () { runModel(true); },
  };
}
