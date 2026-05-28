import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

/**
 * Reads from folio_errors (RLS-scoped to the current user). Returns the
 * most-recent N rows plus a small mutate helper to flip the resolved flag.
 *
 * Also exposes `unresolvedRecent` — the count of unresolved errors within the
 * last 7 days, which the layout uses to gate the Diagnostics nav entry.
 */
export function useErrors(userId, opts) {
  opts = opts || {};
  var limit = typeof opts.limit === "number" ? opts.limit : 100;

  var [errors, setErrors]                       = useState([]);
  var [loading, setLoading]                     = useState(false);
  var [error, setError]                         = useState(null);
  var [unresolvedRecent, setUnresolvedRecent]   = useState(0);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_errors")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(function (r) {
        setLoading(false);
        if (r.error) {
          // Most likely cause: phase6 SQL hasn't been run yet. Don't blow up;
          // hide the nav entry by reporting zero unresolved.
          setError(r.error.message);
          setErrors([]);
          setUnresolvedRecent(0);
          return;
        }
        setError(null);
        var rows = r.data || [];
        setErrors(rows);
        var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].resolved) continue;
          var ts = new Date(rows[i].created_at).getTime();
          if (ts >= cutoff) n += 1;
        }
        setUnresolvedRecent(n);
      }, function (err) {
        setLoading(false);
        setError(err && err.message);
      });
  }, [userId, limit]);

  useEffect(function () { fetch(); }, [fetch]);

  function markResolved(id) {
    return supabase.from("folio_errors").update({ resolved: true }).eq("id", id)
      .then(function (r) {
        if (r && r.error) throw r.error;
        // Optimistic local update so the row flips without a refetch.
        setErrors(function (prev) {
          return prev.map(function (e) { return e.id === id ? Object.assign({}, e, { resolved: true }) : e; });
        });
        setUnresolvedRecent(function (n) { return Math.max(0, n - 1); });
      });
  }

  function markAllResolved() {
    return supabase.from("folio_errors").update({ resolved: true }).eq("user_id", userId).eq("resolved", false)
      .then(function (r) {
        if (r && r.error) throw r.error;
        setErrors(function (prev) { return prev.map(function (e) { return Object.assign({}, e, { resolved: true }); }); });
        setUnresolvedRecent(0);
      });
  }

  return {
    errors:           errors,
    loading:          loading,
    error:            error,
    refetch:          fetch,
    markResolved:     markResolved,
    markAllResolved:  markAllResolved,
    unresolvedRecent: unresolvedRecent,
  };
}
