// Project tasks live in folio_tasks (task-model unification, June 2026).
// gauge_projects.stages is a frozen read-only backup — never read or written
// by the app anymore. This module is the one place that:
//   1. fetches a project's folio_tasks rows,
//   2. shapes them stage-compatible (so legacy readers that key on
//      `.completed_at`/`.sub_stages` work unchanged when pointed at
//      `project.tasks`), and
//   3. attaches an ordered `.tasks` array to each project.
//
// See supabase/task_unification_plan.md + supabase/task_unification.sql.

import { supabase } from "./supabase";

// A folio_task is "done" via the boolean column; the legacy stage shape used a
// `completed_at` timestamp. Expose BOTH so every consumer agrees.
export function taskToStageShape(t) {
  if (!t) return t;
  return Object.assign({}, t, {
    // Stage-compat alias: truthy iff the task is complete, carrying the
    // completion timestamp so recency checks (stuck detection) still work.
    completed_at: t.done ? (t.closed_at || t.updated_at || null) : null,
  });
}

// Stable ordering inside a project: sort_order first (nulls last), then
// created_at — mirrors the old stages array order + supports drag-reorder.
export function sortProjectTasks(rows) {
  return (rows || []).slice().sort(function (a, b) {
    var sa = a.sort_order, sb = b.sort_order;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa == null && sb != null) return 1;
    if (sa != null && sb == null) return -1;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

// Attach `.tasks` (ordered, stage-shaped folio_task rows) to each project.
export function attachTasksToProjects(projects, taskRows) {
  var byProject = {};
  (taskRows || []).forEach(function (t) {
    if (!t || !t.project_id) return;
    (byProject[t.project_id] || (byProject[t.project_id] = [])).push(t);
  });
  return (projects || []).map(function (p) {
    var rows = sortProjectTasks(byProject[p.id] || []);
    return Object.assign({}, p, { tasks: rows.map(taskToStageShape) });
  });
}

// Fetch folio_tasks for a set of project ids. RLS scopes to own + org-peer
// (folio_tasks_org_read) so leader/teammate views see real tasks too.
export function fetchProjectTasks(projectIds) {
  var ids = (projectIds || []).filter(Boolean);
  if (ids.length === 0) return Promise.resolve([]);
  return supabase
    .from("folio_tasks")
    .select("*")
    .in("project_id", ids)
    .limit(2000)
    .then(function (r) { return r.error ? [] : (r.data || []); });
}

// Map a stage-shaped object (from a stages editor) to folio_tasks columns.
// `idx` becomes sort_order so editor order is preserved. Pure — no I/O.
export function stageToTaskFields(s, idx, firstStatus) {
  var done = !!s.completed_at;
  return {
    title:                 s.title || "",
    assignee_email:        s.assignee_email || null,
    recipient:             s.recipient || null,
    due_date:              s.due_date || null,
    is_external:           !!s.is_external,
    external_contact_id:   s.external_contact_id || null,
    external_contact_name: s.external_contact_name || null,
    // null = not blocked; "" or text = blocked (mirrors stage semantics)
    blocked_reason:        (s.blocked_reason === undefined ? null : s.blocked_reason),
    sub_stages:            s.sub_stages || [],
    task_status:           s.task_status || firstStatus,
    custom_fields:         s.custom_fields || {},
    is_commitment:         !!s.is_commitment,
    status:                done ? "complete" : (s.blocked_reason != null ? "blocked" : "planned"),
    done:                  done,
    closed_at:             done ? (s.closed_at || s.completed_at || new Date().toISOString()) : null,
    sort_order:            idx,
  };
}

// Next sort_order for appending a task to a project (max + 1).
export function nextSortOrder(tasks) {
  var max = -1;
  (tasks || []).forEach(function (t) {
    if (typeof t.sort_order === "number" && t.sort_order > max) max = t.sort_order;
  });
  return max + 1;
}
