import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { timed } from "../lib/net";
import { useRealtimeSync } from "./useRealtimeSync";

export function useAccounts(userId) {
  var [accounts, setAccounts] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var cacheKey = "folio_accts_" + userId;

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    timed("accounts.fetch", function () {
      return supabase
        .from("folio_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("name");
    })
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
        var str = JSON.stringify(result.data || []);
        if (str.length <= 400000) localStorage.setItem(cacheKey, str);
      });
  }, [userId, cacheKey]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. A change to folio_accounts on any
  // device (filtered to this user) triggers a debounced refetch here.
  useRealtimeSync("folio_accounts", userId, fetch);

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
