import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useItems(userId, accountId) {
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

  function addItem(data) {
    return supabase
      .from("folio_items")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        if (data.account_id) {
          supabase.from("folio_accounts")
            .update({ last_interaction_at: new Date().toISOString() })
            .eq("id", data.account_id)
            .then(function (r) { if (r && r.error) console.error("Metadata update failed:", r.error.message); })
            .catch(function (err) { console.error("Metadata update failed:", err); });
        }
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
