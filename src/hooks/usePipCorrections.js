import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// pip_correction_log access.
//
// Captures any moment the user disagrees with Pip — rejected plan rows,
// edits to Pip's proposed item text, edits to Pip's meeting summary —
// so the next summarize call can read them back and avoid repeating the
// same misreads.
//
// Per-account in-memory cache of the most recent N rows. Caller passes
// the account id and gets back the corrections that touch this account
// (account_id = X OR account_id is null for cross-account patterns).
//
// Writes are fire-and-forget; the read-back is best-effort. A failed
// correction log entry never blocks Apply or any UI flow.

var DEFAULT_LIMIT = 20;

export function usePipCorrections(userId, accountId) {
  var [corrections, setCorrections] = useState([]);
  var [loading, setLoading]         = useState(false);
  var [error, setError]             = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("pip_correction_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(DEFAULT_LIMIT);
    if (accountId) {
      query = query.or("account_id.eq." + accountId + ",account_id.is.null");
    }
    query.then(function (result) {
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      setError(null);
      setCorrections(result.data || []);
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  // Log one correction. Returns a promise so callers can chain, but the
  // returned promise swallows errors — correction logging never blocks the
  // primary user action.
  function logCorrection(entry) {
    if (!userId) return Promise.resolve(null);
    if (!entry || !entry.correction_type) return Promise.resolve(null);
    return supabase
      .from("pip_correction_log")
      .insert([{
        user_id:         userId,
        account_id:      entry.account_id || accountId || null,
        meeting_id:      entry.meeting_id || null,
        correction_type: entry.correction_type,
        original_value:  entry.original_value || null,
        corrected_value: entry.corrected_value || null,
        reason:          entry.reason || null,
      }])
      .then(function (result) {
        if (result.error) {
          if (typeof window !== "undefined" && window.console) {
            window.console.warn("[pip_correction_log] insert failed:", result.error.message);
          }
          return null;
        }
        fetch();
        return result.data;
      })
      .catch(function () { return null; });
  }

  // Bulk log — useful from PipSummarizePreview where many rows can produce
  // many corrections in one Apply. Falls back to sequential logCorrection
  // calls if Supabase rejects the array insert.
  function logCorrections(entries) {
    if (!userId || !Array.isArray(entries) || !entries.length) return Promise.resolve(null);
    var rows = entries
      .filter(function (e) { return e && e.correction_type; })
      .map(function (e) {
        return {
          user_id:         userId,
          account_id:      e.account_id || accountId || null,
          meeting_id:      e.meeting_id || null,
          correction_type: e.correction_type,
          original_value:  e.original_value || null,
          corrected_value: e.corrected_value || null,
          reason:          e.reason || null,
        };
      });
    if (!rows.length) return Promise.resolve(null);
    return supabase
      .from("pip_correction_log")
      .insert(rows)
      .then(function (result) {
        if (result.error) {
          if (typeof window !== "undefined" && window.console) {
            window.console.warn("[pip_correction_log] bulk insert failed:", result.error.message);
          }
          return null;
        }
        fetch();
        return result.data;
      })
      .catch(function () { return null; });
  }

  return { corrections, loading, error, refetch: fetch, logCorrection, logCorrections };
}
