import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logSilentFailure } from "../lib/logSilentFailure.js";

export function taskPattern(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function usePipAssignmentHints(userId, accountId) {
  var [hints, setHints]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("pip_assignment_hints")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (accountId) {
      query = query.or("account_id.eq." + accountId + ",account_id.is.null");
    }
    query.then(function (result) {
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      setError(null);
      setHints(result.data || []);
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addHint(targetAccountId, pattern, assigneeEmail) {
    if (!userId || !pattern || !assigneeEmail) return Promise.resolve(null);
    var normalized = taskPattern(pattern);
    if (!normalized) return Promise.resolve(null);
    return supabase
      .from("pip_assignment_hints")
      .insert([{
        user_id:        userId,
        account_id:     targetAccountId || null,
        task_pattern:   normalized,
        assignee_email: assigneeEmail,
      }])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        var inserted = result.data[0];
        // Auto-promote to org-wide hint (account_id=null) once 3+ account-
        // specific hints share the same pattern + assignee. This lets Pip
        // route the same kind of work to the right person across any account
        // without needing a per-account hint.
        if (targetAccountId) {
          supabase
            .from("pip_assignment_hints")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("task_pattern", normalized)
            .eq("assignee_email", assigneeEmail)
            .not("account_id", "is", null)
            .then(function (countResult) {
              if (countResult.error || (countResult.count || 0) < 3) return;
              // Only insert if no org-wide hint exists yet.
              supabase
                .from("pip_assignment_hints")
                .select("id")
                .eq("user_id", userId)
                .eq("task_pattern", normalized)
                .eq("assignee_email", assigneeEmail)
                .is("account_id", null)
                .maybeSingle()
                .then(function (existResult) {
                  if (existResult.data) return; // already exists
                  supabase
                    .from("pip_assignment_hints")
                    .insert([{
                      user_id:        userId,
                      account_id:     null,
                      task_pattern:   normalized,
                      assignee_email: assigneeEmail,
                    }])
                    .then(function () { fetch(); })
                    .catch(function (err) { logSilentFailure("usePipAssignmentHints/cross-account-insert", err); });
                })
                .catch(function (err) { logSilentFailure("usePipAssignmentHints/cross-account-lookup", err); });
            })
            .catch(function (err) { logSilentFailure("usePipAssignmentHints/per-account-lookup", err); });
        }
        fetch();
        return inserted;
      });
  }

  // Remove a learned default (item 54 — consent/control: Chris can always undo
  // what Pip codified). Optimistic.
  function removeHint(id) {
    if (!id) return Promise.resolve();
    setHints(function (prev) { return prev.filter(function (h) { return h.id !== id; }); });
    return supabase
      .from("pip_assignment_hints")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (result) { if (result.error) fetch(); /* revert on failure */ });
  }

  return { hints, loading, error, refetch: fetch, addHint, removeHint };
}
