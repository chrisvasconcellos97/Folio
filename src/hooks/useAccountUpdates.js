import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { useRealtimeSync } from "./useRealtimeSync";

// Revenue-impact updates per account. Mirrors the shape of useProjects /
// useContacts — owner-scoped via RLS, debounced realtime refetch, and a
// fire-and-forget activity log on add.
export function useAccountUpdates(userId, accountId, orgId) {
  var [updates, setUpdates] = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId || !accountId) return;
    setLoading(true);
    supabase
      .from("folio_account_updates")
      .select("*")
      .eq("account_id", accountId)
      .order("update_date", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (result.error) {
          setError(result.error.message);
        } else {
          setError(null);
          setUpdates(result.data || []);
        }
      });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  useRealtimeSync("folio_account_updates", userId, fetch);

  function addUpdate(data) {
    var payload = Object.assign({}, data, {
      user_id:    userId,
      account_id: accountId,
      org_id:     orgId || null,
    });
    return supabase
      .from("folio_account_updates")
      .insert([payload])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        logActivity(orgId, userId, accountId, "account_update_logged", {
          title:       data.title,
          update_type: data.update_type,
        });
        fetch();
        return result.data[0];
      });
  }

  function updateUpdate(id, data) {
    return supabase
      .from("folio_account_updates")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteUpdate(id) {
    return supabase
      .from("folio_account_updates")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { updates, loading, error, refetch: fetch, addUpdate, updateUpdate, deleteUpdate };
}
