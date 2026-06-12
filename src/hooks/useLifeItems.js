import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useRealtimeSync } from "./useRealtimeSync";

// Life module data — personal items (appointments / events / honey-do) from the
// `life_items` table, RLS-scoped to the user. Mirrors the useQuickTasks shape.
//
// Pass `enabled: false` (Work mode) to suppress all fetches and subscriptions.
// The hook returns an empty-but-valid API so consumers don't need null-checks.
export function useLifeItems(userId, opts) {
  var enabled = !opts || opts.enabled !== false;
  var [items, setItems]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId || !enabled) return;
    setLoading(true);
    supabase
      .from("life_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (result.error) { setError(result.error.message); return; }
        setError(null);
        setItems(result.data || []);
      });
  }, [userId, enabled]);

  useEffect(function () { fetch(); }, [fetch]);
  // Pass null userId to useRealtimeSync when disabled — the hook no-ops on
  // null so no WS channel is opened in Work mode.
  useRealtimeSync("life_items", enabled ? userId : null, fetch);

  function addItem(data) {
    return supabase
      .from("life_items")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
      });
  }

  function updateItem(id, data) {
    setItems(function (prev) {
      return prev.map(function (t) { return t.id === id ? Object.assign({}, t, data) : t; });
    });
    return supabase
      .from("life_items")
      .update(Object.assign({}, data, { updated_at: new Date().toISOString() }))
      .eq("id", id)
      .then(function (result) {
        if (result.error) { fetch(); throw result.error; }
        fetch();
      });
  }

  function completeItem(id) {
    return updateItem(id, { status: "done", done_at: new Date().toISOString() });
  }

  function deleteItem(id) {
    setItems(function (prev) { return prev.filter(function (t) { return t.id !== id; }); });
    return supabase
      .from("life_items")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) { fetch(); throw result.error; }
        fetch();
      });
  }

  return { items, loading, error, addItem, updateItem, completeItem, deleteItem, refetch: fetch };
}
