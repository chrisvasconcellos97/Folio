// Pure utility for Gauge project status auto-computation.
// "blocked" and "on_hold" are manual states the user sets — never auto-override them.
// For discrete projects: count completed_at on stages + sub_stages.
// For standing projects: count tasks in the last task_status column (the "done" lane).
export function computeAutoStatus(stages, isStanding, taskStatusColumns, currentStatus) {
  if (currentStatus === "blocked" || currentStatus === "on_hold" || currentStatus === "draft") {
    return currentStatus;
  }
  if (!stages || stages.length === 0) {
    return "planned";
  }
  if (isStanding) {
    var cols = taskStatusColumns && taskStatusColumns.length > 0 ? taskStatusColumns : ["intake", "in_progress", "done"];
    var doneCol = cols[cols.length - 1];
    var total = stages.length;
    var done = stages.filter(function (t) { return t.task_status === doneCol || !!t.completed_at; }).length;
    if (done >= total) return "complete";
    if (done > 0) return "in_progress";
    return "planned";
  } else {
    var total = 0, done = 0;
    stages.forEach(function (s) {
      total++;
      if (s.completed_at) done++;
      (s.sub_stages || []).forEach(function (sub) {
        total++;
        if (sub.completed_at) done++;
      });
    });
    if (done >= total) return "complete";
    if (done > 0) return "in_progress";
    return "planned";
  }
}
