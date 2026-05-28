import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useRealtimeSync } from "./useRealtimeSync";

export function useQuickTasks(userId) {
  var [tasks, setTasks]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_quick_tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (result.error) { setError(result.error.message); return; }
        setTasks(result.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("folio_quick_tasks", userId, fetch);

  function addTask(data) {
    return supabase
      .from("folio_quick_tasks")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
      });
  }

  function updateTask(id, data) {
    return supabase
      .from("folio_quick_tasks")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteTask(id) {
    return supabase
      .from("folio_quick_tasks")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { tasks, loading, error, addTask, updateTask, deleteTask };
}
