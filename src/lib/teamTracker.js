// Team request queue — the Tuesday-tracker lens over Gauge projects.
//
// Folios is the MASTER of the team request tracker; the team's Excel sheet is
// an OUTPUT. A "request" IS a Gauge project (see CLAUDE.md Game Plan Phase 2 #2
// + the June-21 handoff): the tracker columns map almost 1:1 onto
// gauge_projects, so the queue is a lens over projects flagged
// `on_team_tracker`, NOT a parallel data store. This is what cures the
// two-system drift by construction — every project CAN surface on the sheet.
//
// DATA LINE (locked by Chris, June 21 2026): the sheet's "# of Shops" column is
// quantitative OEC business data and is DELIBERATELY NOT STORED in Folios. The
// export emits an EMPTY cell in that position (column order preserved); Chris
// fills it by hand in Excel. Never add a shop_count column here or anywhere —
// that would cross the data line. See docs/data-handling.md.

import { toLocalDate } from "./dateUtils.js";
import { resolveAssignee } from "./ownerLabel.js";

// The team Excel sheet's columns, in EXACT order. The export emits one
// tab-separated line per project in this order so it pastes straight into the
// sheet's cells. Changing this order changes what lands in which Excel column —
// don't reorder without matching the live sheet.
export var TEAM_TRACKER_COLUMNS = [
  "Priority",
  "Date of Request",
  "Owner",
  "Supplier",
  "# of Shops",
  "Email Thread",
  "Initiative",
  "Required Completion Date",
  "Connection Macro Date",
  "Integration Macro Date",
  "Comments",
];

var PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

// Excel-friendly date: M/D/YYYY, no leading zeros, no locale dependence.
// Built from date parts (NOT toLocaleDateString — check-guards Guard 2) so it's
// deterministic regardless of the runner's locale and pastes clean into Excel.
export function fmtTrackerDate(input) {
  if (!input) return "";
  var d = toLocalDate(input);
  if (!d || isNaN(d.getTime())) return "";
  return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
}

// Resolve the Supplier cell: one or more linked account names, comma-joined.
// Prefers account_ids (multi-account) and falls back to the primary account_id.
function supplierLabel(project, accounts) {
  var byId = {};
  (accounts || []).forEach(function (a) { byId[a.id] = a; });
  var ids = (project.account_ids && project.account_ids.length)
    ? project.account_ids
    : (project.account_id ? [project.account_id] : []);
  var names = ids
    .map(function (id) { return byId[id] ? byId[id].name : null; })
    .filter(Boolean);
  return names.join(", ");
}

// Comments cell: the latest status pulse if there is one, else the durable
// notes scratchpad. (status_updates is newest-first: [{body, at, by}].)
function commentsLabel(project) {
  var ups = project.status_updates;
  if (ups && ups.length && ups[0] && ups[0].body) return ups[0].body;
  return project.notes || "";
}

// A cell can never contain a tab or newline — those are the TSV record/field
// delimiters. Collapse any internal whitespace runs to a single space so a
// multi-line note pastes into ONE Excel cell.
export function tsvEscape(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

// Map one project to its ordered tracker row (array of raw cell strings, before
// TSV escaping). Order MUST match TEAM_TRACKER_COLUMNS.
export function projectToTrackerRow(project, ctx) {
  ctx = ctx || {};
  var members = ctx.members;
  var accounts = ctx.accounts;
  var owner = project.assignee || project.requested_by || "";
  return [
    PRIORITY_LABEL[project.priority] || "",                              // Priority
    fmtTrackerDate(project.requested_at || project.created_at),          // Date of Request
    owner ? resolveAssignee(owner, members) : "",                       // Owner
    supplierLabel(project, accounts),                                    // Supplier
    "",                                                                  // # of Shops — DATA LINE: never stored
    project.email_thread_url || "",                                      // Email Thread
    project.title || "",                                                 // Initiative
    fmtTrackerDate(project.expected_complete_date || project.due_date),  // Required Completion Date
    fmtTrackerDate(project.connection_macro_date),                       // Connection Macro Date
    fmtTrackerDate(project.integration_macro_date),                      // Integration Macro Date
    commentsLabel(project),                                              // Comments
  ];
}

// Build the tab-separated export for a set of projects — one line per project,
// cells in sheet order, no header row (so it pastes straight into Excel cells).
export function buildTrackerTSV(projects, ctx) {
  return (projects || [])
    .map(function (p) {
      return projectToTrackerRow(p, ctx).map(tsvEscape).join("\t");
    })
    .join("\n");
}

// A project is "dirty" (needs re-export to the sheet) when it has never been
// exported, or it changed since the last export. tracker_exported_at is stamped
// each time its row is copied.
export function isTrackerDirty(project) {
  if (!project.tracker_exported_at) return true;
  var changed = new Date(project.updated_at || 0).getTime();
  var exported = new Date(project.tracker_exported_at).getTime();
  return changed > exported;
}

// The projects that belong on the team sheet (flagged), newest-request first.
export function trackerProjects(projects) {
  return (projects || [])
    .filter(function (p) { return p.on_team_tracker; })
    .sort(function (a, b) {
      return new Date(b.requested_at || b.created_at || 0) -
             new Date(a.requested_at || a.created_at || 0);
    });
}

// Is now a good moment to nudge Chris to sync the sheet? The team meeting is
// Tuesday; he reviews/updates Monday afternoon → Tuesday morning. Returns true
// Mon (after ~noon) and all day Tue. `now` injectable for tests.
export function isTrackerReminderWindow(now) {
  var d = now || new Date();
  var day = d.getDay(); // 0 Sun … 6 Sat
  if (day === 2) return true;                 // Tuesday — meeting day
  if (day === 1 && d.getHours() >= 12) return true; // Monday afternoon
  return false;
}
