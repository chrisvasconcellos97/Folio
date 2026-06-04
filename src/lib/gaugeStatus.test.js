import { describe, it, expect } from "vitest";
import { allTasksComplete, isProjectComplete, autoStatusPatch } from "./gaugeStatus";

var done = { completed_at: "2026-06-01T00:00:00Z" };
var open = { completed_at: null };

describe("allTasksComplete", function () {
  it("is true when every stage is completed", function () {
    expect(allTasksComplete({ stages: [done, done] })).toBe(true);
  });
  it("is false when any stage is open", function () {
    expect(allTasksComplete({ stages: [done, open] })).toBe(false);
  });
  it("is false with no stages (nothing to complete)", function () {
    expect(allTasksComplete({ stages: [] })).toBe(false);
  });
  it("never auto-completes a standing project", function () {
    expect(allTasksComplete({ is_standing: true, stages: [done, done] })).toBe(false);
  });
});

describe("isProjectComplete", function () {
  it("respects an explicit complete status", function () {
    expect(isProjectComplete({ status: "complete", stages: [open] })).toBe(true);
  });
  it("treats all-tasks-done as complete even when status lags (the bug)", function () {
    expect(isProjectComplete({ status: "in_progress", stages: [done, done] })).toBe(true);
  });
  it("is false when work remains", function () {
    expect(isProjectComplete({ status: "in_progress", stages: [done, open] })).toBe(false);
  });
});

describe("autoStatusPatch", function () {
  it("flips to complete when all tasks finish", function () {
    expect(autoStatusPatch([done, done], "in_progress", false)).toEqual({ status: "complete" });
  });
  it("reverts to in_progress when a task is un-checked", function () {
    expect(autoStatusPatch([done, open], "complete", false)).toEqual({ status: "in_progress" });
  });
  it("no-ops when nothing changed", function () {
    expect(autoStatusPatch([done, open], "in_progress", false)).toBeNull();
  });
  it("never flips a draft to complete", function () {
    expect(autoStatusPatch([done, done], "draft", false)).toBeNull();
  });
  it("never touches a standing project", function () {
    expect(autoStatusPatch([done, done], "in_progress", true)).toBeNull();
  });
});
