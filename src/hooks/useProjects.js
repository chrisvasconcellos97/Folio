import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activity";
import { useRealtimeSync } from "./useRealtimeSync";
import { fetchProjectTasks, attachTasksToProjects } from "../lib/projectTasks";

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
      if (result.error) {
        setLoading(false);
        setError(result.error.message);
        return;
      }
      var projs = result.data || [];
      // Task-model unification: project work lives in folio_tasks. Hydrate
      // each project with its ordered, stage-shaped `.tasks` so every reader
      // sees the canonical store (gauge_projects.stages is a frozen backup).
      fetchProjectTasks(projs.map(function (p) { return p.id; })).then(function (taskRows) {
        setLoading(false);
        setError(null);
        setProjects(attachTasksToProjects(projs, taskRows));
      });
    });
  }, [userId, accountId, extrasKey]);

  // Keep the latest projects in a ref so the task-only re-hydration path can
  // read them without re-running the (heavier) gauge_projects query.
  var projectsRef = useRef([]);
  useEffect(function () { projectsRef.current = projects; }, [projects]);

  // folio_tasks changed but the project SET didn't (a task add/edit/complete
  // doesn't alter project metadata). Re-pull just the tasks and re-attach onto
  // the projects we already have — skipping the `select("*").limit(500)` over
  // gauge_projects that the full `fetch()` would do on every task edit. New or
  // deleted PROJECTS still arrive via the separate gauge_projects channel below.
  var rehydrateTasks = useCallback(function () {
    var current = projectsRef.current;
    if (!current || !current.length) { fetch(); return; } // nothing hydrated yet → full load
    fetchProjectTasks(current.map(function (p) { return p.id; })).then(function (taskRows) {
      setProjects(attachTasksToProjects(projectsRef.current, taskRows));
    });
  }, [fetch]);

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
  // gauge_projects changes (new/edited/deleted project) → full refetch.
  useRealtimeSync("gauge_projects", userId, fetch);
  // folio_tasks changes (task add/edit/complete) → lightweight task-only
  // re-hydration; the project metadata is unchanged, so skip the 500-row
  // gauge_projects pull. (Perf: this fired a full refetch on every task edit.)
  useRealtimeSync("folio_tasks", userId, rehydrateTasks);

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
