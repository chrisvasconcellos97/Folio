import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { touchAccount } from "../lib/touchAccount";
import { useRealtimeSync } from "./useRealtimeSync";

export function useContacts(userId, accountId, orgId) {
  var [contacts, setContacts] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var fetch = useCallback(function () {
    if (!userId || !accountId) return;
    setLoading(true);
    supabase
      .from("folio_contacts")
      .select("*")
      .eq("account_id", accountId)
      .order("name")
      .then(function (result) {
        setLoading(false);
        if (result.error) {
          setError(result.error.message);
        } else {
          setError(null);
          setContacts(result.data || []);
        }
      });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("folio_contacts", userId, fetch);

  function addContact(data) {
    return supabase
      .from("folio_contacts")
      .insert([Object.assign({}, data, { user_id: userId, account_id: accountId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        if (accountId) {
          touchAccount(accountId);
        }
        logActivity(orgId, userId, accountId, "contact_added", { name: data.name });
        fetch();
        return result.data[0];
      });
  }

  function updateContact(id, data) {
    return supabase
      .from("folio_contacts")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteContact(id) {
    return supabase
      .from("folio_contacts")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { contacts, loading, error, refetch: fetch, addContact, updateContact, deleteContact };
}
