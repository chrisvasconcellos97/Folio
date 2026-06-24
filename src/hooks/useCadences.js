import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useRealtimeSync } from "./useRealtimeSync";

export function useCadences(userId, accountId) {
  var [cadences, setCadences] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

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
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setCadences(result.data || []);
      }
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("folio_cadences", userId, fetch);

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
    // Account-less leadership tasks tie to this cadence via cadence_id as their
    // ONLY anchor. cadence_id is ON DELETE SET NULL, so deleting the cadence nulls
    // that anchor → account_id null + cadence_id null + project_id null violates
    // chk_task_has_anchor and the DELETE aborts with a raw DB error. So:
    //   • OPEN such tasks → block the delete (don't silently drop active work).
    //   • DONE such tasks → hard-delete them (already-finished 1:1 to-dos that
    //     would otherwise become unanchored orphans the instant the cadence is gone).
    // Tasks that also carry a project_id are anchored independently — leave them.
    return supabase
      .from("folio_tasks")
      .select("id, done")
      .is("account_id", null)
      .is("project_id", null)
      .eq("cadence_id", id)
      .then(function (r) {
        if (r.error) throw r.error;
        var rows = r.data || [];
        var openCount = rows.filter(function (t) { return !t.done; }).length;
        if (openCount > 0) {
          throw new Error(
            "This cadence has " + openCount + " open leadership task" +
            (openCount === 1 ? "" : "s") +
            ". Complete or reassign them before deleting."
          );
        }
        var doneIds = rows.map(function (t) { return t.id; }); // all remaining are done
        var clearDone = doneIds.length
          ? supabase.from("folio_tasks").delete().in("id", doneIds)
          : Promise.resolve({ error: null });
        return clearDone.then(function (d) {
          if (d && d.error) throw d.error;
          return supabase
            .from("folio_cadences")
            .delete()
            .eq("id", id)
            .then(function (result) {
              if (result.error) throw result.error;
              fetch();
            });
        });
      });
  }

  return { cadences, loading, error, refetch: fetch, addCadence, updateCadence, deleteCadence };
}

// Hook for person-scoped (1:1) cadences — not tied to any account.
export function usePersonCadences(userId) {
  var [cadences, setCadences] = useState([]);
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("folio_cadences")
      .select("*, folio_contacts(id, name, title)")
      .eq("user_id", userId)
      .eq("cadence_scope", "person")
      .order("created_at", { ascending: true })
      .then(function (result) {
        setLoading(false);
        if (result.error) {
          setError(result.error.message);
        } else {
          setError(null);
          setCadences(result.data || []);
        }
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  useRealtimeSync("folio_cadences", userId, fetch);

  return { cadences, loading, error, refetch: fetch };
}
