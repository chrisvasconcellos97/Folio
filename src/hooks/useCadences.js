import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useCadences(userId, accountId) {
  var [cadences, setCadences] = useState([]);
  var [loading, setLoading]   = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("folio_cadences")
      .select("*, folio_accounts(id, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (accountId) query = query.or("account_id.eq." + accountId + ",is_global.eq.true");
    query.then(function (result) {
      setLoading(false);
      if (!result.error) setCadences(result.data || []);
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addCadence(data) {
    return supabase
      .from("folio_cadences")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
      });
  }

  function updateCadence(id, data) {
    return supabase
      .from("folio_cadences")
      .update(Object.assign({}, data, { updated_at: new Date().toISOString() }))
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteCadence(id) {
    return supabase
      .from("folio_cadences")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { cadences, loading, refetch: fetch, addCadence, updateCadence, deleteCadence };
}
