// Gauge V3 Phase 1 — folio_tasks read hook.
//
// Mirrors useItems' shape (loading / error / refetch / RLS-scoped fetch)
// but reads from the new unified folio_tasks table. Used by the new queue
// UI built in Phase 3 and the Leader rollup in Phase 5. Existing surfaces
// useItems also reads folio_tasks now; this hook is the lower-level read path.
//
// Filtering: pass {accountId, projectId, assigneeEmail} as needed. Omit
// to get the user's full task list.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useRealtimeSync } from "./useRealtimeSync";

export function useTasks(userId, opts) {
  opts = opts || {};
  var accountId     = opts.accountId     || null;
  var projectId     = opts.projectId     || null;
  var assigneeEmail = opts.assigneeEmail || null;
  var openOnly      = opts.openOnly      === true;
  // When true, DON'T filter by the caller's user_id — used to read a teammate's
  // tasks (by assignee_email) relying on the folio_tasks org-read RLS policy.
  // Without the policy this simply returns the caller's own visible rows
  // (no regression).
  var orgScope      = opts.orgScope      === true;

  var [tasks, setTasks]     = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    var q = supabase.from("folio_tasks").select("*");
    if (!orgScope)     q = q.eq("user_id", userId);
    if (accountId)     q = q.eq("account_id", accountId);
    if (projectId)     q = q.eq("project_id", projectId);
    if (assigneeEmail) q = q.eq("assignee_email", assigneeEmail);
    if (openOnly)      q = q.eq("done", false);
    q.order("due_date",   { ascending: true,  nullsFirst: false })
     .order("created_at", { ascending: false })
     .then(function (r) {
       setLoading(false);
       if (r.error) setError(r.error.message);
       else { setError(null); setTasks(r.data || []); }
     });
  }, [userId, accountId, projectId, assigneeEmail, openOnly, orgScope]);

  useEffect(function () { fetch(); }, [fetch]);
  useRealtimeSync("folio_tasks", userId, fetch);

  return { tasks: tasks, loading: loading, error: error, refetch: fetch };
}

export function updateTask(userId, taskId, fields) {
  if (!userId || !taskId) return Promise.reject(new Error("missing args"));
  return supabase
    .from("folio_tasks")
    .update(fields)
    .eq("id", taskId)
    .eq("user_id", userId)
    .then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
}

export function deleteTask(userId, taskId) {
  if (!userId || !taskId) return Promise.reject(new Error("missing args"));
  return supabase
    .from("folio_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", userId)
    .then(function (r) {
      if (r.error) throw r.error;
    });
}

// Module-level write helpers. Phase 1 only needs the insert helper for the
// dual-write path; updates and deletes will land in Phase 6 with the
// TaskDetailPanel rewrite.
export function insertTask(userId, payload) {
  if (!userId) return Promise.reject(new Error("no userId"));
  var row = Object.assign(
    { user_added: false },
    payload,
    { user_id: userId }
  );
  return supabase
    .from("folio_tasks")
    .insert([row])
    .select()
    .single()
    .then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
}
