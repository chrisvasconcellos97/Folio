// usePipDripQuestions — manages the drip-question queue for Pip Phase 2.
//
// Loads folio_pip_questions rows where source='gap_observed',
// applies throttle rules (paused, 48h cooldown, 1/day, 3/week),
// exposes the active question + answer/skip/dismiss actions.
//
// Throttle is fully DB-driven (persisted, cross-device) — no localStorage.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

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

  // ── Throttle computation ────────────────────────────────────────────────

  // Returns Promise<{paused, has24hActivity, has3in7days}> so we can decide
  // whether to surface a question.
  function loadThrottleState() {
    if (!userId) return Promise.resolve({ paused: true, has24hActivity: false, has3in7days: false });

    var now = Date.now();
    var h24ago  = new Date(now - 24  * 60 * 60 * 1000).toISOString();
    var d7ago   = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();

    // Query: most-recent skip/dismiss/answered (for 48h cooldown + daily limit)
    return supabase
      .from("folio_pip_questions")
      .select("status, answered_at")
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .in("status", ["answered", "skipped", "dismissed"])
      .order("answered_at", { ascending: false })
      .limit(20)
      .then(function (r) {
        var hist = r.data || [];

        // 48h cooldown: any skip/dismiss in last 48h → wait.
        var h48ago = new Date(now - 48 * 60 * 60 * 1000).toISOString();
        var recentSkip = hist.some(function (row) {
          return (row.status === "skipped" || row.status === "dismissed") &&
            row.answered_at && row.answered_at > h48ago;
        });
        if (recentSkip) return { paused: false, has24hActivity: true, has3in7days: false };

        // 1/day: any answer/skip/dismiss with answered_at in last 24h → done today.
        var doneToday = hist.some(function (row) {
          return row.answered_at && row.answered_at > h24ago;
        });

        // 3 per rolling 7 days: count rows with answered_at in last 7 days.
        var last7 = hist.filter(function (row) {
          return row.answered_at && row.answered_at > d7ago;
        }).length;

        return {
          paused:          false,
          has24hActivity:  doneToday,
          has3in7days:     last7 >= 3,
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

    loadThrottleState().then(function (t) {
      setThrottleLoaded(true);
      if (t.paused || t.has24hActivity || t.has3in7days) {
        setActiveQuestion(null);
        return;
      }
      // Pick the first queued/asked row (already ordered by priority desc, created_at asc).
      var candidate = rows.find(function (r) { return r.status === "queued" || r.status === "asked"; });
      if (!candidate) { setActiveQuestion(null); return; }

      // Mark as 'asked' if it's still 'queued' (first time shown).
      if (candidate.status === "queued") {
        var now = new Date().toISOString();
        supabase
          .from("folio_pip_questions")
          .update({ status: "asked", asked_at: now })
          .eq("id", candidate.id)
          .eq("user_id", userId)
          .then(function (r) {
            if (r.error) return;
            setRows(function (prev) {
              return prev.map(function (row) {
                return row.id === candidate.id ? Object.assign({}, row, { status: "asked", asked_at: now }) : row;
              });
            });
          });
        setActiveQuestion(Object.assign({}, candidate, { status: "asked", asked_at: now }));
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
  }, [userId, rows.length, profile && profile.pip_questions_paused]);

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
        // If category is 'terminology', call onTermLearned with the term + answer.
        var row = rows.find(function (x) { return x.id === id; });
        if (row && row.category === "terminology" && typeof onTermLearned === "function") {
          onTermLearned(row.trigger_context || row.question_text, text);
        }
        setActiveQuestion(null);
        setRows(function (prev) {
          return prev.filter(function (x) { return x.id !== id; });
        });
        return fetch();
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
  // DB-driven (not a session counter) so it accumulates across days/devices —
  // the daily throttle means answers trickle in one at a time, so a session
  // counter would never reach the threshold.
  var [answeredSince, setAnsweredSince] = useState(0);

  var countAnsweredSince = useCallback(function () {
    if (!userId) return;
    // prose_generated_at marks the last synthesis; null → count every answer.
    var since = (profile && profile.prose_generated_at) || "1970-01-01T00:00:00Z";
    supabase
      .from("folio_pip_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "gap_observed")
      .eq("status", "answered")
      .gt("answered_at", since)
      .then(function (r) {
        if (r.error) return;
        setAnsweredSince(r.count || 0);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile && profile.prose_generated_at]);

  useEffect(function () { countAnsweredSince(); }, [countAnsweredSince]);

  // Wrap answerQuestion to refresh the re-synthesis count afterward.
  function answerAndCount(id, text) {
    return answerQuestion(id, text).then(function (result) {
      countAnsweredSince();
      return result;
    });
  }

  return {
    activeQuestion:         throttleLoaded ? activeQuestion : null,
    answerQuestion:         answerAndCount,
    skipQuestion:           skipQuestion,
    dismissQuestion:        dismissQuestion,
    answeredSinceSynthesis: answeredSince,
    loading:                loading,
    error:                  error,
    refetch:                fetch,
  };
}
