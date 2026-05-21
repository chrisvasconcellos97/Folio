import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useContacts(userId, accountId) {
  var [contacts, setContacts] = useState([]);
  var [loading, setLoading]   = useState(false);

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
        if (!result.error) setContacts(result.data || []);
      });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addContact(data) {
    return supabase
      .from("folio_contacts")
      .insert([Object.assign({}, data, { user_id: userId, account_id: accountId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
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

  return { contacts, loading, refetch: fetch, addContact, updateContact, deleteContact };
}
