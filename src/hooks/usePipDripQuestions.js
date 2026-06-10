// usePipDripQuestions — manages the drip-question queue for Pip Phase 2.
//
// Loads folio_pip_questions rows where source='gap_observed',
// applies a soft daily cap, exposes the active question + answer/skip/dismiss.
//
// Throttle is a handful per day: answer one and the next surfaces immediately
// (so you can catch up in a sitting), up to DAILY_CAP interactions per 24h.
// No weekly cap, no multi-hour cooldown — the questions are now observation-
// driven (gaps + terminology), not a personality quiz, so a steady stream is
// the point. Throttle is DB-driven (persisted, cross-device) — no localStorage.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

// Max questions surfaced per rolling 24h. "A handful a day."
var DAILY_CAP = 5;

export function usePipDripQuestions(userId, profile, onTermLearned) {
  var [rows, setRows]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]   = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_pip_questions")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["queued", "asked"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .then(function (r) {
        setLoading(false);
        if (r.error) { setError(r.error.message); return; }
        setError(null);
        setRows(r.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  // ── Throttle + re-synthesis count (single query) ───────────────────────
  //
  // Queries 2 + 3 collapsed: one fetch over answered/skipped/dismissed rows
  // going back to the earlier of (24h ago) or (prose_generated_at) covers both
  // the daily-cap check (last24) and the re-synthesis counter (answeredSince).

  // Returns Promise<{paused, dailyCountReached, answeredSince}>
  function loadThrottleAndCount() {
    if (!userId) return Promise.resolve({ paused: true, dailyCountReached: true, answeredSince: 0 });

    var now = Date.now();
    var h24ago = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    var since  = (profile && profile.prose_generated_at) || "1970-01-01T00:00:00Z";
    // Use the earlier timestamp as the query floor so one round-trip covers both windows.
    var floor  = since < h24ago ? since : h24ago;

    return supabase
      .from("folio_pip_questions")
      .select("status, answered_at")
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["answered", "skipped", "dismissed"])
      .gt("answered_at", floor)
      .order("answered_at", { ascending: false })
      .limit(200)
      .then(function (r) {
        var hist = r.data || [];
        var last24 = hist.filter(function (row) {
          return row.answered_at && row.answered_at > h24ago;
        }).length;
        var answeredSince = hist.filter(function (row) {
          return row.status === "answered" && row.answered_at && row.answered_at > since;
        }).length;
        return {
          paused:            false,
          dailyCountReached: last24 >= DAILY_CAP,
          answeredSince:     answeredSince,
        };
      });
  }

  // ── Active question derivation ──────────────────────────────────────────
  // This is computed once after fetch (async) and stored in state.
  var [activeQuestion, setActiveQuestion] = useState(null);
  var [throttleLoaded, setThrottleLoaded] = useState(false);

  useEffect(function () {
    if (!userId) { setActiveQuestion(null); return; }
    if (profile && profile.pip_questions_paused) { setActiveQuestion(null); setThrottleLoaded(true); return; }

    loadThrottleAndCount().then(function (t) {
      setThrottleLoaded(true);
      setAnsweredSince(t.answeredSince);
      if (t.paused || t.dailyCountReached) {
        setActiveQuestion(null);
        return;
      }
      // Pick the first queued/asked row (already ordered by priority desc, created_at asc).
      var candidate = rows.find(function (r) { return r.status === "queued" || r.status === "asked"; });
      if (!candidate) { setActiveQuestion(null); return; }

      // Mark as 'asked' if it's still 'queued' (first time shown).
      if (candidate.status === "queued") {
        var nowISO = new Date().toISOString();
        supabase
          .from("folio_pip_questions")
          .update({ status: "asked", asked_at: nowISO })
          .eq("id", candidate.id)
          .eq("user_id", userId)
          .then(function (r) {
            if (r.error) return;
            setRows(function (prev) {
              return prev.map(function (row) {
                return row.id === candidate.id ? Object.assign({}, row, { status: "asked", asked_at: nowISO }) : row;
              });
            });
          });
        setActiveQuestion(Object.assign({}, candidate, { status: "asked", asked_at: nowISO }));
      } else {
        setActiveQuestion(candidate);
      }
    }).catch(function (err) {
      console.warn("[usePipDripQuestions] throttle check failed:", err && err.message);
      setThrottleLoaded(true);
      setActiveQuestion(null);
    });
  // Re-run when rows change (after fetch) or profile paused flag changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, rows.length, profile && profile.pip_questions_paused, profile && profile.prose_generated_at]);

  // ── Actions ─────────────────────────────────────────────────────────────

  function answerQuestion(id, text) {
    if (!userId) return Promise.resolve();
    var now = new Date().toISOString();
    return supabase
      .from("folio_pip_questions")
      .update({ status: "answered", answer_text: text, answered_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (r) {
        if (r.error) throw r.error;
        var row = rows.find(function (x) { return x.id === id; });
        // If category is 'terminology', call onTermLearned with the term + answer.
        if (row && row.category === "terminology" && typeof onTermLearned === "function") {
          onTermLearned(row.trigger_context || row.question_text, text);
        }
        var suggestion = row && row.suggestion ? row.suggestion : null;
        setActiveQuestion(null);
        setRows(function (prev) {
          return prev.filter(function (x) { return x.id !== id; });
        });
        fetch();
        // Resolve with the structured suggestion (if any) so the caller can
        // offer a "save it to the account/contact" approval.
        return { suggestion: suggestion };
      });
  }

  function skipQuestion(id) {
    if (!userId) return Promise.resolve();
    var now = new Date().toISOString();
    return supabase
      .from("folio_pip_questions")
      .update({ status: "skipped", answered_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (r) {
        if (r.error) throw r.error;
        setActiveQuestion(null);
        setRows(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
      });
  }

  function dismissQuestion(id) {
    if (!userId) return Promise.resolve();
    var now = new Date().toISOString();
    return supabase
      .from("folio_pip_questions")
      .update({ status: "dismissed", answered_at: now })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (r) {
        if (r.error) throw r.error;
        setActiveQuestion(null);
        setRows(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
      });
  }

  // ── Re-synthesis signal ─────────────────────────────────────────────────
  // Count of answered drip questions since the profile was last synthesized.
  // Derived from the combined throttle+count query above; updated on each
  // throttle check and after each answer.
  var [answeredSince, setAnsweredSince] = useState(0);

  // Wrap answerQuestion to refresh the throttle+count state afterward.
  function answerAndCount(id, text) {
    return answerQuestion(id, text).then(function (result) {
      // Trigger a fresh throttle+count check so answeredSince updates.
      loadThrottleAndCount().then(function (t) { setAnsweredSince(t.answeredSince); }).catch(function () {});
      return result;
    });
  }

  return {
    activeQuestion:         throttleLoaded ? activeQuestion : null,
    queuedQuestions:        rows,
    answerQuestion:         answerAndCount,
    skipQuestion:           skipQuestion,
    dismissQuestion:        dismissQuestion,
    answeredSinceSynthesis: answeredSince,
    loading:                loading,
    error:                  error,
    refetch:                fetch,
  };
}
