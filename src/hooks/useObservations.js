import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { computeStreamFingerprint } from "../lib/observations";

// useObservations — the Mastermind / Synthesis layer (item 52) data hook.
//
// Reads the user's OPEN observations (the "✦ Pip connected some dots" card) and
// drives generation: fingerprint-gated + once/day so the Sonnet pass only runs
// when the stream actually moved (no wasted spend). FAIL-SOFT — every read/write
// swallows a missing-table error so the app is unaffected until
// supabase/observations.sql is run by hand.
export function useObservations(userId) {
  var [observations, setObservations] = useState([]);
  var [generating, setGenerating]     = useState(false);

  var fetchOpen = useCallback(function () {
    if (!userId) { setObservations([]); return; }
    supabase
      .from("folio_observations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(function (r) {
        // Missing table / RLS / any error → behave as "no observations" (fail-soft).
        if (r.error) { setObservations([]); return; }
        setObservations(r.data || []);
      });
  }, [userId]);

  useEffect(function () { fetchOpen(); }, [fetchOpen]);

  // Generate — call the synthesis pass IF the stream moved and we haven't run
  // today. streamInput is the { accounts, tasks, meetings, themes } bundle the
  // caller assembles. No-ops silently on any gate or failure.
  var generate = useCallback(function (streamInput, todayISO) {
    if (!userId || !streamInput) return Promise.resolve();
    var fp = computeStreamFingerprint(streamInput);
    var fpKey  = "folio_obs_fp_" + userId;
    var dayKey = "folio_obs_gen_" + userId + "_" + (todayISO || "");
    var lastFp = null, ranToday = false;
    try { lastFp = localStorage.getItem(fpKey); } catch (_) { /* ignore */ }
    try { ranToday = localStorage.getItem(dayKey) === "1"; } catch (_) { /* ignore */ }
    // Gate: same stream as last run, OR already ran today → skip (no spend).
    if (fp === lastFp || ranToday) return Promise.resolve();

    setGenerating(true);
    return supabase.auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session ? s.data.session.access_token : null;
      if (!token) { setGenerating(false); return; }
      return fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ stream: streamInput, todayISO: todayISO }),
      })
        .then(function (r) { return r.json(); })
        .then(function (out) {
          // Mark this fingerprint + day as run regardless of result, so we don't
          // re-bill on the same stream.
          try { localStorage.setItem(fpKey, fp); localStorage.setItem(dayKey, "1"); } catch (_) { /* ignore */ }
          setGenerating(false);
          var obs = (out && Array.isArray(out.observations)) ? out.observations : [];
          if (!obs.length) return;
          var rows = obs.map(function (o) {
            return { user_id: userId, fingerprint: fp, status: "open", observation: o };
          });
          return supabase.from("folio_observations").insert(rows).then(function (ins) {
            if (!ins.error) fetchOpen();
          });
        })
        .catch(function () { setGenerating(false); });
    }).catch(function () { setGenerating(false); });
  }, [userId, fetchOpen]);

  // Optimistic status update (acted / dismissed) — drops the row from the card.
  function setStatus(id, status) {
    setObservations(function (prev) { return prev.filter(function (o) { return o.id !== id; }); });
    return supabase
      .from("folio_observations")
      .update({ status: status, status_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (r) { if (r.error) fetchOpen(); /* revert on failure */ });
  }

  var dismiss = useCallback(function (id) { return setStatus(id, "dismissed"); }, [userId, fetchOpen]);
  var markActed = useCallback(function (id) { return setStatus(id, "acted"); }, [userId, fetchOpen]);

  return { observations: observations, generating: generating, generate: generate, dismiss: dismiss, markActed: markActed, refetch: fetchOpen };
}
