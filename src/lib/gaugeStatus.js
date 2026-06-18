// Shared Gauge project completion logic — one source of truth so Home,
// Gauge, Pip, and the write paths all agree on what "done" means.
//
// The bug this guards against: the auto-flip-to-complete logic used to live
// only in the discrete stage editor, so completing the last task via any
// other path (flat task toggle, kanban) set the stage's completed_at but
// left project.status at "in_progress". Every read-side check keyed on
// status === "complete" then disagreed with reality — a project showed as
// overdue/"burning" forever despite all its tasks being done.

import { C } from "./colors";

// ── ONE canonical Gauge project-status config ────────────────────────────
// Home, Gauge, the account Projects tab, the Leader rollup, and the project
// modal all render the same five statuses — they used to each keep a private
// label/color map and drifted (in_progress was C.accent in one place and the
// C.statusInProgress token in another; "Watch"/"Watching" diverged). This is
// the single source of truth (App Coherence Rule). Colors are C tokens only
// (Theme Rule) so both themes + Life-mode re-skin for free.
//
//   token — the {text,bg,border} status pill token (use for badges)
//   color — the text color alone (use for a left-edge bar / status dot)
export var GAUGE_STATUS_CONFIG = {
  draft:       { label: "Draft",       token: C.statusDraft,      color: C.statusDraft.text },
  planned:     { label: "Planned",     token: C.statusPlanned,    color: C.statusPlanned.text },
  in_progress: { label: "In Progress", token: C.statusInProgress, color: C.statusInProgress.text },
  blocked:     { label: "Blocked",     token: C.statusBlocked,    color: C.statusBlocked.text },
  complete:    { label: "Complete",    token: C.statusComplete,   color: C.statusComplete.text },
  on_hold:     { label: "On Hold",     token: C.statusOnHold,     color: C.statusOnHold.text },
};

// Convenience: label / token / color for an arbitrary status string, with a
// neutral fallback so an unexpected value never throws.
export function gaugeStatusLabel(status) {
  var c = GAUGE_STATUS_CONFIG[status];
  return c ? c.label : (status || "");
}
export function gaugeStatusToken(status) {
  var c = GAUGE_STATUS_CONFIG[status];
  return c ? c.token : C.statusPlanned;
}

// The kanban column a brand-new task should land in — the project's first
// configured status column, or "intake" by default.
export function firstStatusColumn(project) {
  var cols = project && project.task_status_columns;
  if (Array.isArray(cols) && cols.length) {
    var first = cols[0];
    if (typeof first === "string") return first;
    if (first && first.id) return first.id;
  }
  return "intake";
}

// A project belongs to an account if it's the primary account_id OR the
// account appears in the multi-account account_ids array. Used everywhere a
// project is filtered to a single account so multi-account projects surface
// under every account they touch.
export function projectMatchesAccount(p, accountId) {
  if (!p || !accountId) return false;
  if (p.account_id === accountId) return true;
  return Array.isArray(p.account_ids) && p.account_ids.indexOf(accountId) >= 0;
}

// A discrete project is effectively complete when it has tasks and every
// task is completed — even if the stored status field never flipped.
// Standing projects are ongoing by nature and never auto-complete.
export function allTasksComplete(project) {
  if (!project || project.is_standing) return false;
  var stages = project.tasks || [];
  if (stages.length === 0) return false;
  return stages.every(function (s) { return !!s.completed_at; });
}

// True when a project should be treated as done anywhere in the UI —
// either its status says so, or all its tasks are complete.
export function isProjectComplete(project) {
  if (!project) return false;
  return project.status === "complete" || allTasksComplete(project);
}

// Status patch to apply after a stage mutation, or null if no change is
// needed. Flips to "complete" when all tasks are done; reverts a complete
// project back to "in_progress" if a task gets un-checked. Never touches
// standing or draft projects.
export function autoStatusPatch(stages, currentStatus, isStanding) {
  if (isStanding) return null;
  var list = stages || [];
  var allDone = list.length > 0 && list.every(function (s) { return !!s.completed_at; });
  if (allDone && currentStatus !== "complete" && currentStatus !== "draft") return { status: "complete" };
  if (!allDone && currentStatus === "complete") return { status: "in_progress" };
  return null;
}
