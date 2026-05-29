import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useGlossary(userId, orgId, accountId) {
  var [entries, setEntries] = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("pip_glossary")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (accountId) {
      query = query.or("account_id.eq." + accountId + ",account_id.is.null");
    }
    query.then(function (result) {
      setLoading(false);
      if (result.error) { setError(result.error.message); return; }
      setError(null);
      setEntries(result.data || []);
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addEntry(data) {
    if (!userId) return Promise.resolve(null);
    var row = {
      user_id:       userId,
      org_id:        orgId || null,
      account_id:    data.account_id || null,
      term:          (data.term || "").trim(),
      definition:    (data.definition || "").trim(),
      preserve_case: data.preserve_case !== false,
      aliases:       Array.isArray(data.aliases) ? data.aliases : [],
    };
    return supabase
      .from("pip_glossary")
      .insert([row])
      .then(function (result) {
        if (result.error) throw new Error(result.error.message);
        fetch();
        return result.data;
      });
  }

  function updateEntry(id, patch) {
    if (!userId || !id) return Promise.resolve(null);
    return supabase
      .from("pip_glossary")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (result) {
        if (result.error) throw new Error(result.error.message);
        fetch();
        return result.data;
      });
  }

  function deleteEntry(id) {
    if (!userId || !id) return Promise.resolve(null);
    return supabase
      .from("pip_glossary")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .then(function (result) {
        if (result.error) throw new Error(result.error.message);
        fetch();
        return result.data;
      });
  }

  return { entries, loading, error, addEntry, updateEntry, deleteEntry, refetch: fetch };
}
