import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useItems(userId, accountId) {
  var [items, setItems]   = useState([]);
  var [loading, setLoading] = useState(false);

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
      if (!result.error) setItems(result.data || []);
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
            .eq("id", data.account_id).then();
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

  return { items, loading, refetch: fetch, addItem, closeItem, deleteItem };
}
