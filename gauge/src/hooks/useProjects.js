import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useProjects(userId) {
  var [projects, setProjects] = useState([]);
  var [loading, setLoading]   = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("gauge_projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(function (result) {
        setLoading(false);
        if (!result.error) setProjects(result.data || []);
      });
  }, [userId]);

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

  return { projects, loading, addProject, updateProject, deleteProject };
}
