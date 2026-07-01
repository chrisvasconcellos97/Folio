import { describe, it, expect } from "vitest";
import {
  daysUntil,
  conferenceStatus,
  isPrepWindow,
  nextConference,
  buildLooseEndsSweep,
  presentationProgress,
} from "./conferencePrep";

var TODAY = "2026-10-15";

describe("conferencePrep", () => {
  describe("daysUntil", () => {
    it("counts forward to a future start date", () => {
      expect(daysUntil({ start_date: "2026-11-02" }, TODAY)).toBe(18);
    });
    it("returns 0 on the start date itself", () => {
      expect(daysUntil({ start_date: TODAY }, TODAY)).toBe(0);
    });
    it("returns negative once the date has passed", () => {
      expect(daysUntil({ start_date: "2026-10-01" }, TODAY)).toBe(-14);
    });
    it("returns null without a start_date", () => {
      expect(daysUntil({}, TODAY)).toBeNull();
    });
  });

  describe("conferenceStatus", () => {
    var conf = { start_date: "2026-11-02", end_date: "2026-11-05" };
    it("is upcoming before the window", () => {
      expect(conferenceStatus(conf, TODAY)).toBe("upcoming");
    });
    it("is active inside the inclusive window", () => {
      expect(conferenceStatus(conf, "2026-11-03")).toBe("active");
      expect(conferenceStatus(conf, "2026-11-02")).toBe("active");
      expect(conferenceStatus(conf, "2026-11-05")).toBe("active");
    });
    it("is past after the window", () => {
      expect(conferenceStatus(conf, "2026-11-06")).toBe("past");
    });
  });

  describe("isPrepWindow", () => {
    it("is true within the default 21-day window", () => {
      expect(isPrepWindow({ start_date: "2026-11-02" }, TODAY)).toBe(true);
    });
    it("is false outside the window", () => {
      expect(isPrepWindow({ start_date: "2026-12-15" }, TODAY)).toBe(false);
    });
    it("respects a custom window", () => {
      expect(isPrepWindow({ start_date: "2026-11-02" }, TODAY, 10)).toBe(false);
    });
    it("is false once the conference has started", () => {
      expect(isPrepWindow({ start_date: "2026-10-01" }, TODAY)).toBe(false);
    });
  });

  describe("nextConference", () => {
    it("picks the nearest upcoming/active conference and ignores past ones", () => {
      var list = [
        { id: "a", start_date: "2026-09-01", end_date: "2026-09-03" }, // past
        { id: "b", start_date: "2026-12-01", end_date: "2026-12-03" },
        { id: "c", start_date: "2026-11-02", end_date: "2026-11-05" }, // nearest
      ];
      expect(nextConference(list, TODAY).id).toBe("c");
    });
    it("returns null when nothing is upcoming", () => {
      expect(nextConference([{ id: "a", start_date: "2026-01-01", end_date: "2026-01-03" }], TODAY)).toBeNull();
    });
  });

  describe("buildLooseEndsSweep", () => {
    var conference = { account_ids: ["acct-1"] };
    var accounts = [{ id: "acct-1", name: "All Star" }, { id: "acct-2", name: "LKQ" }];
    var items = [
      { id: "i1", account_id: "acct-1", due_date: "2026-10-10", done: false, text: "Send shop file" },
      { id: "i2", account_id: "acct-2", due_date: "2026-10-12", done: false, text: "Chase legal" },
      { id: "i3", account_id: "acct-2", done: true, text: "Old done item" },
      { id: "i4", account_id: "acct-2", done: false, text: "Someday idea" }, // no due, not a commitment — noise
    ];
    var projects = [
      { id: "p1", account_id: "acct-1", status: "in_progress", waiting_on: "Rusty", title: "Integration" },
      { id: "p2", account_id: "acct-2", status: "in_progress", title: "No loose end" }, // no waiting_on/due — skipped
    ];
    it("separates conference-account rows from the rest of the portfolio", () => {
      var out = buildLooseEndsSweep({ conference: conference, items: items, projects: projects, accounts: accounts });
      expect(out.conferenceRows.map(function (r) { return r.id; })).toEqual(["i1", "p1"]);
      expect(out.portfolioRows.map(function (r) { return r.id; })).toEqual(["i2"]);
    });
    it("resolves account names", () => {
      var out = buildLooseEndsSweep({ conference: conference, items: items, projects: projects, accounts: accounts });
      expect(out.conferenceRows[0].account_name).toBe("All Star");
    });
  });

  describe("presentationProgress", () => {
    it("computes done/total/pct from project tasks", () => {
      var project = { tasks: [{ done: true }, { done: true }, { done: false }, { done: false }] };
      expect(presentationProgress(project)).toEqual({ total: 4, done: 2, pct: 50 });
    });
    it("returns nulls for a project with no tasks", () => {
      expect(presentationProgress({ tasks: [] })).toEqual({ total: 0, done: 0, pct: null });
    });
    it("handles a missing project", () => {
      expect(presentationProgress(null)).toEqual({ total: 0, done: 0, pct: null });
    });
  });
});
