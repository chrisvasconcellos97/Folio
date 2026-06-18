// Write side of the task-model unification. Editors that used to mutate a
// project's `stages` array and persist the whole array now call these helpers,
// which translate the array into folio_tasks inserts/updates/deletes.
//
// Kept separate from projectTasks.js (pure read helpers) so modules that only
// need the read shape don't pull in the Supabase write hooks.

import { insertTask, updateTask, deleteTask } from "../hooks/useTasks";
import { firstStatusColumn } from "./gaugeStatus";
import { stageToTaskFields } from "./projectTasks";

// Reconcile a full stage-shaped array against the project's current
// folio_tasks (project.tasks): update matched rows (by id, position = idx),
// insert new ones, delete removed. Returns a Promise of all writes.
export function reconcileProjectTasks(userId, project, nextStages) {
  if (!userId || !project || !project.id) return Promise.resolve();
  var firstStatus = firstStatusColumn(project);
  var current = (project && project.tasks) || [];
  var byId = {};
  current.forEach(function (t) { if (t.id) byId[t.id] = t; });
  var keptIds = {};
  var ops = [];
  (nextStages || []).forEach(function (s, idx) {
    var fields = stageToTaskFields(s, idx, firstStatus);
    if (s.id && byId[s.id]) {
      keptIds[s.id] = true;
      ops.push(updateTask(userId, s.id, fields));
    } else {
      ops.push(insertTask(userId, Object.assign(
        { project_id: project.id, account_id: s.account_id || project.account_id || null },
        fields
      )));
    }
  });
  current.forEach(function (t) {
    if (t.id && !keptIds[t.id]) ops.push(deleteTask(userId, t.id));
  });
  return Promise.all(ops);
}
