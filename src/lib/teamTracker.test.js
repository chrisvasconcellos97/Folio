import { describe, it, expect } from "vitest";
import {
  TEAM_TRACKER_COLUMNS,
  fmtTrackerDate,
  tsvEscape,
  projectToTrackerRow,
  buildTrackerTSV,
  isTrackerDirty,
  trackerProjects,
  isTrackerReminderWindow,
} from "./teamTracker";

var ACCOUNTS = [
  { id: "a1", name: "All Star Auto" },
  { id: "a2", name: "Fenix Parts" },
];
var MEMBERS = [
  { user_id: "u1", email: "dana@oec.com", full_name: "Dana Reed" },
];

function baseProject(over) {
  return Object.assign({
    id: "p1",
    title: "Catalog integration",
    priority: "high",
    requested_at: "2026-06-01",
    expected_complete_date: "2026-07-15",
    account_id: "a1",
    account_ids: ["a1"],
    assignee: "dana@oec.com",
    on_team_tracker: true,
    status_updates: [],
    notes: "",
  }, over || {});
}

describe("teamTracker", () => {
  describe("column contract", () => {
    it("has the 11 sheet columns in exact order", () => {
      expect(TEAM_TRACKER_COLUMNS).toEqual([
        "Priority", "Date of Request", "Owner", "Supplier", "# of Shops",
        "Email Thread", "Initiative", "Required Completion Date",
        "Connection Macro Date", "Integration Macro Date", "Comments",
      ]);
    });
    it("a project row has exactly one cell per column", () => {
      var row = projectToTrackerRow(baseProject(), { accounts: ACCOUNTS, members: MEMBERS });
      expect(row.length).toBe(TEAM_TRACKER_COLUMNS.length);
    });
  });

  describe("DATA LINE — # of Shops is never stored", () => {
    it("emits an EMPTY cell in the # of Shops position", () => {
      var row = projectToTrackerRow(baseProject({ shop_count: 99 }), { accounts: ACCOUNTS, members: MEMBERS });
      var shopIdx = TEAM_TRACKER_COLUMNS.indexOf("# of Shops");
      expect(row[shopIdx]).toBe("");
    });
  });

  describe("cell resolution", () => {
    it("maps priority, owner (display name), supplier, dates, initiative", () => {
      var row = projectToTrackerRow(baseProject(), { accounts: ACCOUNTS, members: MEMBERS });
      expect(row[0]).toBe("High");                 // Priority
      expect(row[1]).toBe("6/1/2026");             // Date of Request
      expect(row[2]).toBe("Dana Reed");            // Owner resolved from email
      expect(row[3]).toBe("All Star Auto");        // Supplier
      expect(row[6]).toBe("Catalog integration");  // Initiative
      expect(row[7]).toBe("7/15/2026");            // Required Completion Date
    });
    it("joins multiple supplier accounts", () => {
      var row = projectToTrackerRow(baseProject({ account_ids: ["a1", "a2"] }), { accounts: ACCOUNTS, members: MEMBERS });
      expect(row[3]).toBe("All Star Auto, Fenix Parts");
    });
    it("prefers latest status update for Comments, falls back to notes", () => {
      var withPulse = projectToTrackerRow(
        baseProject({ status_updates: [{ body: "waiting on legal", at: "2026-06-03" }], notes: "old note" }),
        { accounts: ACCOUNTS, members: MEMBERS });
      expect(withPulse[10]).toBe("waiting on legal");
      var withNotes = projectToTrackerRow(baseProject({ notes: "scratch" }), { accounts: ACCOUNTS, members: MEMBERS });
      expect(withNotes[10]).toBe("scratch");
    });
    it("leaves unset macro/email cells blank", () => {
      var row = projectToTrackerRow(baseProject(), { accounts: ACCOUNTS, members: MEMBERS });
      expect(row[5]).toBe("");  // Email Thread
      expect(row[8]).toBe("");  // Connection Macro Date
      expect(row[9]).toBe("");  // Integration Macro Date
    });
  });

  describe("fmtTrackerDate", () => {
    it("formats M/D/YYYY with no leading zeros, blank on empty/invalid", () => {
      expect(fmtTrackerDate("2026-01-05")).toBe("1/5/2026");
      expect(fmtTrackerDate("")).toBe("");
      expect(fmtTrackerDate(null)).toBe("");
      expect(fmtTrackerDate("not-a-date")).toBe("");
    });
  });

  describe("tsvEscape", () => {
    it("collapses tabs and newlines so a cell never breaks the TSV grid", () => {
      expect(tsvEscape("line one\nline two")).toBe("line one line two");
      expect(tsvEscape("a\tb")).toBe("a b");
      expect(tsvEscape("  trim me  ")).toBe("trim me");
      expect(tsvEscape(null)).toBe("");
    });
  });

  describe("buildTrackerTSV", () => {
    it("emits one tab-separated line per project, no header row", () => {
      var tsv = buildTrackerTSV([baseProject()], { accounts: ACCOUNTS, members: MEMBERS });
      var lines = tsv.split("\n");
      expect(lines.length).toBe(1);
      expect(lines[0].split("\t").length).toBe(TEAM_TRACKER_COLUMNS.length);
    });
    it("keeps a multi-line note on a single TSV line", () => {
      var tsv = buildTrackerTSV([baseProject({ notes: "first\nsecond" })], { accounts: ACCOUNTS, members: MEMBERS });
      expect(tsv.split("\n").length).toBe(1);
    });
  });

  describe("isTrackerDirty", () => {
    it("is dirty when never exported", () => {
      expect(isTrackerDirty(baseProject({ tracker_exported_at: null, updated_at: "2026-06-01" }))).toBe(true);
    });
    it("is dirty when changed after last export", () => {
      expect(isTrackerDirty(baseProject({ updated_at: "2026-06-05", tracker_exported_at: "2026-06-02" }))).toBe(true);
    });
    it("is clean when exported after last change", () => {
      expect(isTrackerDirty(baseProject({ updated_at: "2026-06-02", tracker_exported_at: "2026-06-05" }))).toBe(false);
    });
  });

  describe("trackerProjects", () => {
    it("keeps only flagged projects, newest request first", () => {
      var list = trackerProjects([
        baseProject({ id: "p1", on_team_tracker: true, requested_at: "2026-06-01" }),
        baseProject({ id: "p2", on_team_tracker: false, requested_at: "2026-06-09" }),
        baseProject({ id: "p3", on_team_tracker: true, requested_at: "2026-06-05" }),
      ]);
      expect(list.map(function (p) { return p.id; })).toEqual(["p3", "p1"]);
    });
  });

  describe("isTrackerReminderWindow", () => {
    it("nudges Monday afternoon and all Tuesday, quiet otherwise", () => {
      expect(isTrackerReminderWindow(new Date(2026, 5, 15, 14, 0))).toBe(true);  // Mon 2pm
      expect(isTrackerReminderWindow(new Date(2026, 5, 15, 9, 0))).toBe(false);  // Mon 9am
      expect(isTrackerReminderWindow(new Date(2026, 5, 16, 8, 0))).toBe(true);   // Tue 8am
      expect(isTrackerReminderWindow(new Date(2026, 5, 17, 14, 0))).toBe(false); // Wed
    });
  });
});
