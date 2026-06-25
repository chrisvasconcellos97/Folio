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
    // A person (1:1) cadence requires its subject contact (chk_person_cadence_
    // requires_contact); the FK is ON DELETE SET NULL, so deleting a contact
    // that's a 1:1 subject nulls cadence.contact_id and trips the CHECK — the
    // delete fails with a cryptic DB error. Block it with a clear, actionable
    // message instead (no destructive cascade).
    return supabase
      .from("folio_cadences")
      .select("id")
      .eq("contact_id", id)
      .eq("cadence_scope", "person")
      .limit(1)
      .then(function (guard) {
        if (!guard.error && guard.data && guard.data.length) {
          throw new Error("This contact is the subject of a 1:1 cadence — delete that 1:1 first, then remove the contact.");
        }
        return supabase
          .from("folio_contacts")
          .delete()
          .eq("id", id)
          .then(function (result) {
            if (result.error) throw result.error;
            fetch();
          });
      });
  }

  return { contacts, loading, error, refetch: fetch, addContact, updateContact, deleteContact };
}
