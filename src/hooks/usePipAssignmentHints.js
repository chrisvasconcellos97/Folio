import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

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
        fetch();
        return result.data[0];
      });
  }

  return { hints, loading, error, refetch: fetch, addHint };
}
