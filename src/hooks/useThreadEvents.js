import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

export function useThreadEvents(threadId) {
  var [events, setEvents]   = useState([]);
  var [loading, setLoading] = useState(false);

  var fetch = useCallback(function () {
    if (!threadId) return;
    setLoading(true);
    supabase
      .from("folio_thread_events")
      .select("*")
      .eq("thread_id", threadId)
      .order("event_date", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (!result.error) setEvents(result.data || []);
      });
  }, [threadId]);

  useEffect(function () { fetch(); }, [fetch]);

  return { events, loading };
}
