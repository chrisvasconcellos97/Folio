import { taskPattern } from "../hooks/usePipAssignmentHints";
import { nextSortOrder } from "./projectTasks";
import { firstStatusColumn } from "./gaugeStatus";

// Translate a stage-shaped update patch to folio_tasks columns. The only
// non-trivial mapping is completed_at -> done/closed_at/status.
function mapTaskUpdateFields(fields) {
  var out = Object.assign({}, fields || {});
  if ("completed_at" in out) {
    var done = !!out.completed_at;
    out.done = done;
    out.closed_at = out.completed_at || null;
    out.status = done ? "complete" : "planned";
    delete out.completed_at;
  }
  return out;
}

/**
 * Apply a selected subset of Pip's structured plan against the existing
 * folio_tasks + Gauge project hooks. Returns { errors: { idx: msg } } so
 * the preview can light up failing rows.
 *
 * Idempotency: the preview disables Apply during the in-flight call, and
 * each underlying hook upsert is keyed on a stable target_id for updates,
 * so re-running on the same plan would create new_item / new_task rows
 * but not double-update existing ones. The Apply button gets the user's
 * one shot per modal open.
 */
export function applyPipPlan(selected, ctx) {
  var errors  = {};
  var addItem        = ctx.addItem;
  var updateItem     = ctx.updateItem;
  var closeItem      = ctx.closeItem;
  var addHint        = ctx.addHint;
  var accountId      = ctx.accountId;
  var cadenceId      = ctx.cadenceId || null;   // provenance for leadership tasks (person/internal cadences)
  var meetingId      = ctx.meetingId || null;
  var activeProjects = ctx.activeProjects || [];

  // Task-model unification: project tasks are folio_tasks rows (project_id set),
  // created via addItem like loose items. Track a per-project append counter so
  // multiple new_task rows in one apply get increasing sort_order.
  var appendCounters = {};
  function nextOrderFor(projectId) {
    if (!(projectId in appendCounters)) {
      var p = activeProjects.find(function (pp) { return pp.id === projectId; });
      appendCounters[projectId] = nextSortOrder(p && p.tasks);
    }
    return appendCounters[projectId]++;
  }

  var promises = selected.map(function (entry) {
    var row = entry.row;
    var idx = entry.idx;

    function fail(msg) { errors[idx] = msg; }

    function maybeLearnHint(text) {
      if (!addHint || !row.assignee) return Promise.resolve();
      if (!row.suggestedAssignee || row.assignee === row.suggestedAssignee) return Promise.resolve();
      return addHint(accountId || null, taskPattern(text), row.assignee).catch(function () { /* hint failures are silent */ });
    }

    switch (row.kind) {
      case "new_item": {
        var targetAcct = row.target_account_id || accountId || null;
        var pipStampedAt = !row._userAdded ? new Date().toISOString() : null;
        var addPayload = {
          text:              row.text,
          due_date:          row.due_date || null,
          owner:             row.assignee || null,
          recipient:         row.recipient || null,
          account_id:        targetAcct,
          // Account-less item born from a person/internal cadence = leadership task.
          cadence_id:        (cadenceId && !targetAcct) ? cadenceId : null,
          source_meeting_id: meetingId,
          is_commitment:     row.is_commitment || false,
        };
        if (pipStampedAt) addPayload.pip_created_at = pipStampedAt;
        if (row.gaugeProjectId) addPayload.project_id = row.gaugeProjectId;
        return addItem(addPayload)
          .then(function () {
            return maybeLearnHint(row.text);
          })
          .catch(function (e) { fail(e && e.message ? e.message : "Add failed"); });
      }

      case "update_item":
        return updateItem(row.target_id, row.fields)
          .catch(function (e) { fail(e && e.message ? e.message : "Update failed"); });

      case "close_item":
        return closeItem(row.target_id)
          .catch(function (e) { fail(e && e.message ? e.message : "Close failed"); });

      case "new_task": {
        // A project task is a folio_tasks row with project_id set. When the
        // project is known we stamp its first kanban column + an appended
        // sort_order so it lands at the end of the board; otherwise it's a
        // loose task (project_id null).
        var proj = activeProjects.find(function (pp) { return pp.id === row.project_id; });
        var taskAcct = row.target_account_id || accountId || null;
        var ntStampedAt = !row._userAdded ? new Date().toISOString() : null;
        var ntPayload = {
          text:              row.title,
          due_date:          row.due_date || null,
          owner:             row.assignee || null,
          recipient:         row.recipient || null,
          account_id:        taskAcct,
          project_id:        row.project_id || null,
          source_meeting_id: meetingId,
          is_commitment:     row.is_commitment || false,
        };
        if (row.project_id) {
          ntPayload.task_status = firstStatusColumn(proj);
          ntPayload.sort_order  = nextOrderFor(row.project_id);
        } else {
          // Account-less loose task born from a person/internal cadence = leadership task.
          ntPayload.cadence_id = (cadenceId && !taskAcct) ? cadenceId : null;
        }
        if (ntStampedAt) ntPayload.pip_created_at = ntStampedAt;
        return addItem(ntPayload)
          .then(function () { return maybeLearnHint(row.title); })
          .catch(function (e) { fail(e && e.message ? e.message : "Add failed"); });
      }

      case "update_task": {
        if (!row.task_id) { fail("Task not found in project"); return Promise.resolve(); }
        // Project tasks are folio_tasks rows now — update by id directly.
        return updateItem(row.task_id, mapTaskUpdateFields(row.fields))
          .catch(function (e) { fail(e && e.message ? e.message : "Update failed"); });
      }

      default:
        return Promise.resolve();
    }
  });

  return Promise.all(promises).then(function () {
    return { errors: errors };
  });
}
