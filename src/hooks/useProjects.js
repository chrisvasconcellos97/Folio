import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { useRealtimeSync } from "./useRealtimeSync";

export function useProjects(userId, accountId, orgId, extraAccountIds) {
  var [projects, setProjects]   = useState([]);
  var [loading, setLoading]     = useState(false);
  var [error, setError]         = useState(null);
  var [templates, setTemplates] = useState([]);

  // Stable key for the extras array so the useCallback dep doesn't change
  // every render when the parent recomputes a fresh array each time.
  var extrasKey = (extraAccountIds || []).slice().sort().join(",");

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var query = supabase
      .from("gauge_projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500); // generous cap — correctness requires all projects for health/status
    var extras = extrasKey ? extrasKey.split(",") : [];
    // Match the primary account_id OR membership in the multi-account
    // account_ids array, so a project linked to several accounts surfaces
    // under every one of them (not just its primary).
    if (accountId) {
      var ids = [accountId].concat(extras);
      query = query.or("account_id.in.(" + ids.join(",") + "),account_ids.ov.{" + ids.join(",") + "}");
    }
    query.then(function (result) {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(null);
        setProjects(result.data || []);
      }
    });
  }, [userId, accountId, extrasKey]);

  var fetchTemplates = useCallback(function () {
    if (!userId) return Promise.resolve([]);
    return supabase
      .from("gauge_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (result) {
        if (!result.error) {
          setTemplates(result.data || []);
          return result.data || [];
        }
        return [];
      });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);
  useEffect(function () { fetchTemplates(); }, [fetchTemplates]);

  // Phase 8 — multi-device realtime sync. See useRealtimeSync.js.
  useRealtimeSync("gauge_projects", userId, fetch);

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
        if (data.status) {
          logActivity(orgId, userId, data.account_id || accountId, "gauge_status_changed", { title: data.title, status: data.status });
        }
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

  function addTemplate(data) {
    return supabase
      .from("gauge_templates")
      .insert([Object.assign({}, data, { user_id: userId, org_id: orgId || null })])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        fetchTemplates();
        return result.data[0];
      });
  }

  function updateTemplate(id, data) {
    return supabase
      .from("gauge_templates")
      .update(data)
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetchTemplates();
      });
  }

  function deleteTemplate(id) {
    return supabase
      .from("gauge_templates")
      .delete()
      .eq("id", id)
      .then(function (result) {
        if (result.error) throw result.error;
        fetchTemplates();
      });
  }

  return { projects, loading, error, refetch: fetch, addProject, updateProject, deleteProject, templates, fetchTemplates, addTemplate, updateTemplate, deleteTemplate };
}
