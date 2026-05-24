import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useProjects(userId, accountId) {
  var [projects, setProjects]   = useState([]);
  var [loading, setLoading]     = useState(false);
  var [error, setError]         = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("gauge_projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    query.then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setProjects(result.data || []);
      }
    });
  }, [userId, accountId]);

  useEffect(function () { fetch(); }, [fetch]);

  function addProject(data) {
    return supabase
      .from("gauge_projects")
      .insert([Object.assign({}, data, { user_id: userId })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        return result.data[0];
      });
  }

  function updateProject(id, data) {
    return supabase
      .from("gauge_projects")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function deleteProject(id) {
    return supabase
      .from("gauge_projects")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { projects, loading, error, refetch: fetch, addProject, updateProject, deleteProject };
}
