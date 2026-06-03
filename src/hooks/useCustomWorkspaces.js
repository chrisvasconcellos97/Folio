import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useCustomWorkspaces(userId) {
  var [workspaces, setWorkspaces] = useState([]);

  var fetch = useCallback(function () {
    if (!userId) return;
    supabase
      .from("folio_custom_workspaces")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(function (r) { if (!r.error) setWorkspaces(r.data || []); });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addWorkspace(name, includeInPortfolio) {
    return supabase
      .from("folio_custom_workspaces")
      .insert([{ user_id: userId, name: name.trim(), include_in_portfolio: !!includeInPortfolio }])
      .select()
      .then(function (r) {
        if (r.error) throw r.error;
        fetch();
        return r.data[0];
      });
  }

  function deleteWorkspace(id) {
    return supabase
      .from("folio_custom_workspaces")
      .delete()
      .eq("id", id)
      .then(function (r) {
        if (r.error) throw r.error;
        fetch();
      });
  }

  return { workspaces, addWorkspace, deleteWorkspace, refetch: fetch };
}
