// Write side of the task-model unification. Editors that used to mutate a
// project's `stages` array and persist the whole array now call these helpers,
// which translate the array into folio_tasks inserts/updates/deletes.
//
// Kept separate from projectTasks.js (pure read helpers) so modules that only
// need the read shape don't pull in the Supabase write hooks.

import { insertTask, updateTask, deleteTask } from "../hooks/useTasks";
import { firstStatusColumn } from "./gaugeStatus";
import { stageToTaskFields } from "./projectTasks";

// Per-project serialization: chains reconciles for the same project on this
// client so two rapid saves (or a save while a prior one is mid-flight) can't
// interleave their insert/update/delete ops against stale state. NOTE: this
// guards SAME-client overlap only; true two-device concurrency would need a
// server-side lock (out of scope — documented for a future pass).
var inFlightByProject = {};

// Reconcile a full stage-shaped array against the project's current
// folio_tasks (project.tasks): update matched rows (by id, position = idx),
// insert new ones, delete removed. Returns a Promise of all writes.
export function reconcileProjectTasks(userId, project, nextStages, currentStages) {
  if (!userId || !project || !project.id) return Promise.resolve();
  var pid = project.id;
  function run() { return doReconcile(userId, project, nextStages, firstStatusColumn(project), currentStages); }
  var prev = inFlightByProject[pid] || Promise.resolve();
  // Run after any prior reconcile for this project, success OR failure.
  var next = prev.then(run, run);
  inFlightByProject[pid] = next.finally(function () {
    if (inFlightByProject[pid] === next) delete inFlightByProject[pid];
  });
  return next;
}

// Diff `nextStages` against `currentStages` — the editor's OWN pre-mutation view,
// NOT project.tasks (which can be stale via realtime lag). The triplication bug
// came from `next` being built off the editor's optimistic state while reconcile
// diffed against a stale/empty project.tasks → every edit looked "new" and
// re-inserted. Falls back to project.tasks for callers that build next from it
// (HubProjectCard). Returns nextStages with real ids filled in (existing for
// updates, DB-generated for inserts) so the editor adopts them and the NEXT edit
// matches by id → updates in place instead of inserting a duplicate.
function doReconcile(userId, project, nextStages, firstStatus, currentStages) {
  var current = currentStages || (project && project.tasks) || [];
  var byId = {};
  current.forEach(function (t) { if (t && t.id) byId[t.id] = t; });
  var keptIds = {};
  var resolved = new Array((nextStages || []).length);
  var ops = [];
  (nextStages || []).forEach(function (s, idx) {
    var fields = stageToTaskFields(s, idx, firstStatus);
    if (s.id && byId[s.id]) {
      keptIds[s.id] = true;
      resolved[idx] = s; // already carries its real id
      ops.push(updateTask(userId, s.id, fields));
    } else {
      ops.push(
        insertTask(userId, Object.assign(
          { project_id: project.id, account_id: s.account_id || project.account_id || null },
          fields
        )).then(function (row) {
          resolved[idx] = Object.assign({}, s, { id: (row && row.id) ? row.id : s.id });
        })
      );
    }
  });
  current.forEach(function (t) {
    if (t && t.id && !keptIds[t.id]) ops.push(deleteTask(userId, t.id));
  });
  return Promise.all(ops).then(function () { return resolved; });
}
