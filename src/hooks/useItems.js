import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { touchAccount } from "../lib/touchAccount";
import { useRealtimeSync } from "./useRealtimeSync";

export function useItems(userId, accountId, orgId) {
  var [items, setItems]   = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    query.then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setItems(result.data || []);
      }
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("folio_items", userId, fetch);

  function addItem(data) {
    return supabase
      .from("folio_items")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        if (data.account_id) {
          touchAccount(data.account_id);
        }
        logActivity(orgId, userId, data.account_id, "item_added", { text: data.text });
        fetch();
        return result.data[0];
      });
  }

  function closeItem(id) {
    return supabase
      .from("folio_items")
      .update({ done: true, closed_at: new Date().toISOString() })
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        logActivity(orgId, userId, accountId, "item_completed", { id: id });
        fetch();
      });
  }

  function updateItem(id, data) {
    return supabase
      .from("folio_items")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        setItems(function (prev) { return prev.map(function (i) { return i.id === id ? Object.assign({}, i, data) : i; }); });
      });
  }

  function deleteItem(id) {
    return supabase
      .from("folio_items")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { items, loading, error, refetch: fetch, addItem, closeItem, updateItem, deleteItem };
}
