import { describe, it, expect } from "vitest";
import {
  weekStart,
  commitmentStats,
  weeklyMovement,
  candidateWins,
  isFridayWrapWindow,
} from "./weekReview";

// Anchor "now" to a Friday so windows are deterministic: 2026-06-19 is a Friday.
var FRI = new Date(2026, 5, 19, 15, 0);     // Fri Jun 19 2026, 3pm
var MON = new Date(2026, 5, 15, 9, 0);      // Mon Jun 15 2026 (week start)

describe("weekReview", () => {
  describe("weekStart", () => {
    it("returns the Monday of the current week", () => {
      var ws = weekStart(FRI);
      expect(ws.getDay()).toBe(1);          // Monday
      expect(ws.getDate()).toBe(15);
      expect(ws.getHours()).toBe(0);
    });
    it("treats Sunday as the end of the prior week", () => {
      var sun = new Date(2026, 5, 21, 12, 0); // Sun Jun 21
      expect(weekStart(sun).getDate()).toBe(15);
    });
  });

  describe("commitmentStats", () => {
    var tasks = [
      { is_commitment: true, done: true,  closed_at: "2026-06-10T12:00:00Z", due_date: "2026-06-12" }, // kept (early)
      { is_commitment: true, done: true,  closed_at: "2026-06-14T12:00:00Z", due_date: "2026-06-12" }, // slipped (late)
      { is_commitment: true, done: true,  closed_at: "2026-06-10T12:00:00Z", due_date: null },          // kept (no due)
      { is_commitment: true, done: false, due_date: "2026-06-10" },                                      // slipped (open + overdue)
      { is_commitment: true, done: false, due_date: "2026-06-30" },                                      // open on track
      { is_commitment: false, done: false, due_date: "2026-06-01" },                                     // not a commitment — ignored
    ];
    it("classifies kept / slipped / open and computes the rate", () => {
      var s = commitmentStats(tasks, { now: FRI });
      expect(s.kept).toBe(2);
      expect(s.slipped).toBe(2);
      expect(s.open).toBe(1);
      expect(s.resolved).toBe(4);
      expect(s.rate).toBe(0.5);
    });
    it("rate is null when nothing has resolved", () => {
      var s = commitmentStats([{ is_commitment: true, done: false, due_date: "2026-12-31" }], { now: FRI });
      expect(s.rate).toBe(null);
    });
  });

  describe("weeklyMovement", () => {
    var accounts = [
      { id: "a1", name: "All Star", last_interaction_at: "2026-06-16" },
      { id: "a2", name: "Fenix", last_interaction_at: "2026-05-01" },   // cold → neglected
      { id: "a3", name: "Not Mine", last_interaction_at: "2026-05-01" },
    ];
    var ctx = {
      now: FRI,
      accounts: accounts,
      meetings: [{ status: "logged", meeting_date: "2026-06-16", account_id: "a1" }],
      projects: [
        { id: "p1", title: "Integration", account_id: "a1", status: "in_progress", updated_at: "2026-06-17T10:00:00Z" },
        { id: "p2", title: "Old", account_id: "a2", status: "in_progress", updated_at: "2026-05-01T10:00:00Z" },
      ],
      tasks: [{ is_commitment: true, done: true, closed_at: "2026-06-17T10:00:00Z", due_date: "2026-06-18" }],
      wins: [{ title: "Won the audit", created_at: "2026-06-17T10:00:00Z" }],
      isMine: function (a) { return a.id !== "a3"; },
    };
    it("reports touched accounts, moved projects, commitments kept, wins", () => {
      var m = weeklyMovement(ctx);
      expect(m.touched.map(function (t) { return t.name; })).toEqual(["All Star"]);
      expect(m.moved.map(function (p) { return p.id; })).toEqual(["p1"]);
      expect(m.commitmentsKept).toBe(1);
      expect(m.commitmentsSlipped).toBe(0);
      expect(m.wins.length).toBe(1);
      expect(m.isQuiet).toBe(false);
    });
    it("flags my own cold accounts as neglected, excludes touched + not-mine", () => {
      var m = weeklyMovement(ctx);
      var names = m.neglected.map(function (n) { return n.name; });
      expect(names).toContain("Fenix");
      expect(names).not.toContain("All Star");   // touched this week
      expect(names).not.toContain("Not Mine");   // not mine
    });
    it("isQuiet when nothing happened", () => {
      var m = weeklyMovement({ now: FRI, accounts: [], meetings: [], projects: [], tasks: [], wins: [] });
      expect(m.isQuiet).toBe(true);
    });
  });

  describe("candidateWins", () => {
    it("surfaces projects completed + commitments kept on time this week", () => {
      var c = candidateWins({
        now: FRI,
        accounts: [{ id: "a1", name: "All Star" }],
        projects: [
          { id: "p1", title: "Done deal", account_id: "a1", status: "complete", updated_at: "2026-06-17T10:00:00Z" },
          { id: "p2", title: "Still going", account_id: "a1", status: "in_progress", updated_at: "2026-06-17T10:00:00Z" },
        ],
        tasks: [
          { id: "t1", text: "Sent the report", is_commitment: true, done: true, closed_at: "2026-06-17T10:00:00Z", due_date: "2026-06-18" },
          { id: "t2", text: "Late one", is_commitment: true, done: true, closed_at: "2026-06-17T10:00:00Z", due_date: "2026-06-10" },
        ],
      });
      var refs = c.map(function (w) { return w.ref; });
      expect(refs).toContain("project:p1");
      expect(refs).toContain("task:t1");
      expect(refs).not.toContain("project:p2"); // not complete
      expect(refs).not.toContain("task:t2");    // closed late
    });
  });

  describe("isFridayWrapWindow", () => {
    it("is true Friday, false otherwise", () => {
      expect(isFridayWrapWindow(FRI)).toBe(true);
      expect(isFridayWrapWindow(MON)).toBe(false);
    });
  });
});
