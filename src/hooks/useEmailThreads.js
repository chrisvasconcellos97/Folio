import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useRealtimeSync } from "./useRealtimeSync.js";

export function useEmailThreads(userId, accountId) {
  var [threads, setThreads] = useState([]);
  var [loading, setLoading]  = useState(false);
  var [error, setError]      = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_email_threads")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    query.then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setThreads(result.data || []);
      }
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  useRealtimeSync("folio_email_threads", userId, fetch);

  return { threads, loading, error, refetch: fetch };
}
