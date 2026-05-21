import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useAccounts(userId) {
  var [accounts, setAccounts] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_accounts")
      .select("*")
      .eq("user_id", userId)
      .order("name")
      .then(function (result) {
        setLoading(false);
        if (result.error) { setError(result.error.message); return; }
        setAccounts(result.data || []);
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addAccount(data) {
    return supabase
      .from("folio_accounts")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
      });
  }

  function updateAccount(id, data) {
    return supabase
      .from("folio_accounts")
      .update(Object.assign({}, data, { updated_at: new Date().toISOString() }))
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteAccount(id) {
    return supabase
      .from("folio_accounts")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { accounts, loading, error, refetch: fetch, addAccount, updateAccount, deleteAccount };
}
