import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useRealtimeSync } from "./useRealtimeSync";

// Leadership tasks = account-less tasks born from a person/internal cadence
// (folio_tasks where cadence_id = this cadence AND account_id IS NULL). They're
// your own work — items from a 1:1 / leadership meeting that don't belong to a
// customer account. Surfaced in the person cadence's hub.
export function useLeadershipTasks(userId, cadenceId) {
  var [tasks, setTasks] = useState([]);

  var fetch = useCallback(function () {
    if (!userId || !cadenceId) { setTasks([]); return; }
    supabase
      .from("folio_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("cadence_id", cadenceId)
      .is("account_id", null)
      .eq("done", false)
      .order("created_at", { ascending: false })
      .then(function (r) { if (!r.error) setTasks(r.data || []); });
  }, [userId, cadenceId]);

  useEffect(function () { fetch(); }, [fetch]);
  useRealtimeSync("folio_tasks", userId, fetch);

  function closeTask(id) {
    return supabase
      .from("folio_tasks")
      .update({ done: true, status: "complete", closed_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", userId)
      .then(function (r) { if (r.error) throw r.error; fetch(); });
  }

  return { tasks: tasks, refetch: fetch, closeTask: closeTask };
}
