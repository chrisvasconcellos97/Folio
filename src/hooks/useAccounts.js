import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useAccounts(userId) {
  var [accounts, setAccounts] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var cacheKey = "folio_accts_" + userId;

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
        if (result.error) {
          setError(result.error.message);
          var cached = localStorage.getItem(cacheKey);
          if (cached) { try { setAccounts(JSON.parse(cached)); } catch (e) {} }
          return;
        }
        setError(null);
        setAccounts(result.data || []);
        localStorage.setItem(cacheKey, JSON.stringify(result.data || []));
      });
  }, [userId, cacheKey]);

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

  // Soft-archive: stash a timestamp but keep the row + every child record.
  // Replaces the hard-delete path Chris previously had on the detail header.
  function archiveAccount(id) {
    return supabase
      .from("folio_accounts")
      .update({ is_inactive: true, inactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function reactivateAccount(id) {
    return supabase
      .from("folio_accounts")
      .update({ is_inactive: false, inactivated_at: null, merged_into_account_id: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  // Server-side atomic merge. Returns the row count moved so callers can
  // surface "47 records moved" in the success toast.
  function mergeAccounts(sourceId, targetId) {
    return supabase
      .rpc("folio_merge_accounts", { source_id: sourceId, target_id: targetId })
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return typeof result.data === "number" ? result.data : 0;
      });
  }

  return {
    accounts, loading, error, refetch: fetch,
    addAccount, updateAccount, deleteAccount,
    archiveAccount, reactivateAccount, mergeAccounts,
  };
}
