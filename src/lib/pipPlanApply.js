import { taskPattern } from "../hooks/usePipAssignmentHints";

function firstStatusColumn(project) {
  var cols = project && project.task_status_columns;
  if (Array.isArray(cols) && cols.length) {
    var first = cols[0];
    if (typeof first === "string") return first;
    if (first && first.id) return first.id;
  }
  return "intake";
}

/**
 * Apply a selected subset of Pip's structured plan against the existing
 * folio_items + Gauge project hooks. Returns { errors: { idx: msg } } so
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
  var updateProject  = ctx.updateProject;
  var addHint        = ctx.addHint;
  var accountId      = ctx.accountId;
  var meetingId      = ctx.meetingId || null;
  var activeProjects = ctx.activeProjects || [];

  // Snapshot projects so multiple new_task / update_task rows on the same
  // project accumulate into one updateProject call (faster + idempotent).
  var projectStaging = {};
  function ensureStage(projectId) {
    if (projectStaging[projectId]) return projectStaging[projectId];
    var p = activeProjects.find(function (pp) { return pp.id === projectId; });
    if (!p) return null;
    projectStaging[projectId] = {
      project: p,
      stages: Array.isArray(p.stages) ? p.stages.slice() : [],
    };
    return projectStaging[projectId];
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
        var addPayload = {
          text:              row.text,
          due_date:          row.due_date || null,
          owner:             row.assignee || null,
          account_id:        targetAcct,
          source_meeting_id: meetingId,
        };
        if (!row._userAdded) addPayload.pip_created_at = new Date().toISOString();
        return addItem(addPayload)
          .then(function () { return maybeLearnHint(row.text); })
          .catch(function (e) { fail(e && e.message ? e.message : "Add failed"); });
      }

      case "update_item":
        return updateItem(row.target_id, row.fields)
          .catch(function (e) { fail(e && e.message ? e.message : "Update failed"); });

      case "close_item":
        return closeItem(row.target_id)
          .catch(function (e) { fail(e && e.message ? e.message : "Close failed"); });

      case "new_task": {
        var newStage = ensureStage(row.project_id);
        if (!newStage) { fail("Project not found"); return Promise.resolve(); }
        var newTaskId = (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : ("t-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
        var pipCreatedAt = new Date().toISOString();
        var taskEntry = {
          id:                newTaskId,
          title:             row.title,
          due_date:          row.due_date || null,
          assignee:          row.assignee || null,
          task_status:       firstStatusColumn(newStage.project),
          account_id:        row.target_account_id || accountId || null,
          source_meeting_id: meetingId,
          created_at:        pipCreatedAt,
          custom_fields:     {},
        };
        if (!row._userAdded) taskEntry.pip_created_at = pipCreatedAt;
        newStage.stages.push(taskEntry);
        // Defer the actual updateProject call until after all rows have
        // mutated the snapshot — see flushStages below.
        return maybeLearnHint(row.title);
      }

      case "update_task": {
        var upStage = ensureStage(row.project_id);
        if (!upStage) { fail("Project not found"); return Promise.resolve(); }
        var i = upStage.stages.findIndex(function (t) { return t && t.id === row.task_id; });
        if (i < 0) { fail("Task not found in project"); return Promise.resolve(); }
        upStage.stages[i] = Object.assign({}, upStage.stages[i], row.fields);
        return Promise.resolve();
      }

      default:
        return Promise.resolve();
    }
  });

  return Promise.all(promises).then(function () {
    // Flush staged project mutations.
    var projectIds = Object.keys(projectStaging);
    var flushPromises = projectIds.map(function (pid) {
      var entry = projectStaging[pid];
      return updateProject(pid, { stages: entry.stages })
        .catch(function (e) {
          // Mark every row that touched this project so the user sees the
          // failure rather than getting a silent miss.
          selected.forEach(function (s) {
            if (s.row.kind === "new_task" || s.row.kind === "update_task") {
              if (s.row.project_id === pid) errors[s.idx] = e && e.message ? e.message : "Project update failed";
            }
          });
        });
    });
    return Promise.all(flushPromises);
  }).then(function () {
    return { errors: errors };
  });
}
